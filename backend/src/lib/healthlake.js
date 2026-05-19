'use strict';

/**
 * Health data layer — previously AWS HealthLake FHIR R4, now Supabase.
 * Exported API is identical so no call sites need updating.
 *
 * Storage mapping:
 *   triage intake          → triage_intakes
 *   conditions / allergies → profiles.known_conditions / profiles.allergies
 *   medications            → profiles.current_medications (column optional)
 *   clinical impressions   → clinical_impressions
 *   encounters             → encounters (clinical fields written directly)
 *   patient upsert         → no-op (profiles managed separately)
 */

const supabase = require('./supabase');
const cache = require('./cache');

const TTL_TRIAGE   = 5  * 60 * 1000;
const TTL_PROFILE  = 10 * 60 * 1000;
const TTL_CONSULTS = 5  * 60 * 1000;

function isConfigured() {
  return true;
}

// ── Patient ───────────────────────────────────────────────────────────────────

async function upsertPatient(_profile) {
  // No-op: profile data is managed via the onboarding and profile save flows.
}

// ── Triage intake ─────────────────────────────────────────────────────────────

async function writeTriageIntake(patientId, { locale, answers, urgency, summary, safety_note }) {
  const { error } = await supabase
    .from('triage_intakes')
    .upsert(
      { user_id: patientId, locale, answers, urgency, summary, safety_note },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`writeTriageIntake failed: ${error.message}`);
  cache.del(`triage:${patientId}`);
  cache.del(`has-triage:${patientId}`);
  cache.del(`home-summary:${patientId}`);
}

async function getTriageIntake(patientId) {
  const cacheKey = `triage:${patientId}`;
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return hit;

  const { data, error } = await supabase
    .from('triage_intakes')
    .select('user_id, locale, answers, urgency, summary, safety_note, created_at, updated_at')
    .eq('user_id', patientId)
    .maybeSingle();

  if (error) {
    console.warn('[health-data] getTriageIntake failed:', error.message);
    return null;
  }
  const result = data ?? null;
  if (result) cache.set(cacheKey, result, TTL_TRIAGE);
  return result;
}

async function hasTriageIntake(patientId) {
  const cacheKey = `has-triage:${patientId}`;
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return hit;

  const { data, error } = await supabase
    .from('triage_intakes')
    .select('user_id')
    .eq('user_id', patientId)
    .maybeSingle();

  if (error) return false;
  const value = !!data;
  cache.set(cacheKey, value, TTL_TRIAGE);
  return value;
}

// ── Conditions ────────────────────────────────────────────────────────────────

async function writeConditions(_patientId, _knownConditions) {
  // No-op: conditions live in profiles.known_conditions, written by the profile save flow.
}

async function getPatientConditions(patientId) {
  const cacheKey = `conditions:${patientId}`;
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return hit;

  const { data, error } = await supabase
    .from('profiles')
    .select('known_conditions')
    .eq('id', patientId)
    .maybeSingle();

  if (error) {
    console.warn('[health-data] getPatientConditions failed:', error.message);
    return [];
  }
  const texts = String(data?.known_conditions || '').split(',').map((s) => s.trim()).filter(Boolean);
  cache.set(cacheKey, texts, TTL_PROFILE);
  return texts;
}

// ── Allergies ─────────────────────────────────────────────────────────────────

async function writeAllergies(_patientId, _allergies) {
  // No-op: allergies live in profiles.allergies, written by the profile save flow.
}

async function getPatientAllergies(patientId) {
  const cacheKey = `allergies:${patientId}`;
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return hit;

  const { data, error } = await supabase
    .from('profiles')
    .select('allergies')
    .eq('id', patientId)
    .maybeSingle();

  if (error) {
    console.warn('[health-data] getPatientAllergies failed:', error.message);
    return [];
  }
  const texts = String(data?.allergies || '').split(',').map((s) => s.trim()).filter(Boolean);
  cache.set(cacheKey, texts, TTL_PROFILE);
  return texts;
}

// ── Medications ───────────────────────────────────────────────────────────────

async function writeMedications(_patientId, _medications) {
  // No-op: medications live in profiles.current_medications (if column exists).
}

async function getPatientMedications(patientId) {
  const cacheKey = `medications:${patientId}`;
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return hit;

  const { data, error } = await supabase
    .from('profiles')
    .select('current_medications')
    .eq('id', patientId)
    .maybeSingle();

  if (error || !data?.current_medications) return [];
  const texts = String(data.current_medications).split(',').map((s) => s.trim()).filter(Boolean);
  cache.set(cacheKey, texts, TTL_PROFILE);
  return texts;
}

// ── Encounters ────────────────────────────────────────────────────────────────
// Clinical fields (urgency, summary, safety_note) are written directly by
// encounters.js — writeEncounter is a no-op here.

async function writeEncounter(_patientId, _encounter) {
  return null;
}

async function getEncounters(patientId) {
  const { data, error } = await supabase
    .from('encounters')
    .select('id, urgency, summary, safety_note, created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('[health-data] getEncounters failed:', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    fhir_id: r.id,
    urgency: r.urgency ?? 'routine',
    summary: r.summary ?? null,
    safety_note: r.safety_note ?? null,
    created_at: r.created_at ?? null,
  }));
}

// ── ClinicalImpression (agent-generated consults) ─────────────────────────────
// Stored in clinical_impressions table.

async function writeClinicalImpression(patientId, consult) {
  for (let lim = 1; lim <= 10; lim++) cache.del(`impressions:${patientId}:${lim}`);

  const { data, error } = await supabase
    .from('clinical_impressions')
    .insert({
      patient_id: patientId,
      complaint: consult.complaint || null,
      urgency: consult.urgency || 'routine',
      care_pathway: consult.care_pathway || null,
      symptoms: consult.symptoms || [],
      recommended_specialty: consult.recommended_specialty || null,
      is_emergency_flagged: !!consult.is_emergency_flagged,
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[health-data] writeClinicalImpression failed:', error.message);
    return null;
  }
  return data?.id ?? null;
}

async function getClinicalImpressions(patientId, limit = 5) {
  const lim = Math.max(1, Math.min(10, Number(limit)));
  const cacheKey = `impressions:${patientId}:${lim}`;
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return hit;

  const { data, error } = await supabase
    .from('clinical_impressions')
    .select('id, complaint, urgency, care_pathway, created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(lim);

  if (error) {
    console.warn('[health-data] getClinicalImpressions failed:', error.message);
    return [];
  }
  const impressions = (data ?? []).map((r) => ({
    id: r.id,
    complaint: r.complaint ?? null,
    urgency: r.urgency ?? 'routine',
    care_pathway: r.care_pathway ?? null,
    created_at: r.created_at ?? null,
  }));
  cache.set(cacheKey, impressions, TTL_CONSULTS);
  return impressions;
}

module.exports = {
  isConfigured,
  upsertPatient,
  writeTriageIntake,
  getTriageIntake,
  hasTriageIntake,
  writeConditions,
  getPatientConditions,
  writeAllergies,
  getPatientAllergies,
  writeMedications,
  getPatientMedications,
  writeEncounter,
  getEncounters,
  writeClinicalImpression,
  getClinicalImpressions,
};
