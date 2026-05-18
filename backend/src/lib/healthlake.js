'use strict';

/**
 * AWS HealthLake FHIR R4 client — full clinical data store.
 *
 * All public functions return null / [] / false when
 * AWS_HEALTHLAKE_DATASTORE_ID is unset so local dev works without AWS.
 *
 * Auth: IAM SigV4 (aws4). Credentials read from env:
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (default us-east-1)
 */

const aws4 = require('aws4');

const REGION = process.env.AWS_REGION || 'us-east-1';
const DATASTORE_ID = process.env.AWS_HEALTHLAKE_DATASTORE_ID || '';
const HOST = `healthlake.${REGION}.amazonaws.com`;
const BASE = `/datastore/${DATASTORE_ID}/r4`;

// Custom coding system namespace
const SYS = {
  TRIAGE: 'urn:ogwu:triage',
  SURVEY: 'http://terminology.hl7.org/CodeSystem/observation-category',
  CONDITION_STATUS: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  ALLERGY_CLINICAL: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
  ALLERGY_VERIFY: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
  ACT: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
};

function isConfigured() {
  return !!DATASTORE_ID && !!process.env.AWS_ACCESS_KEY_ID;
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

async function fhirRequest(method, resourcePath, body) {
  const path = `${BASE}/${resourcePath}`;
  const opts = {
    service: 'healthlake',
    region: REGION,
    method,
    host: HOST,
    path,
    headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
  };
  if (body) opts.body = JSON.stringify(body);

  aws4.sign(opts, {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });

  const fetchImpl = global.fetch || require('node-fetch');
  const url = `https://${HOST}${path}`;
  console.log(`[healthlake] ${method} ${url.split('?')[0]}`);

  const res = await fetchImpl(url, {
    method: opts.method,
    headers: opts.headers,
    body: opts.body,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[healthlake] ${method} ${resourcePath.split('?')[0]} → ${res.status}: ${text.slice(0, 600)}`);
    throw new Error(`HealthLake ${method} ${resourcePath.split('?')[0]} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

function patientRef(patientId) {
  return `Patient%2F${patientId}`;
}

// ── Patient ───────────────────────────────────────────────────────────────────

async function upsertPatient(profile) {
  if (!isConfigured()) return null;
  const genderMap = { male: 'male', female: 'female', other: 'other' };
  const sex = String(profile.biological_sex || profile.sex || '').toLowerCase();
  return fhirRequest('PUT', `Patient/${profile.id}`, {
    resourceType: 'Patient',
    id: profile.id,
    identifier: [{ system: 'urn:ogwu:patient', value: profile.id }],
    name: [{ family: profile.last_name || '', given: [profile.first_name || ''] }],
    gender: genderMap[sex] ?? 'unknown',
    ...(profile.dob ? { birthDate: String(profile.dob).slice(0, 10) } : {}),
  });
}

// ── Triage intake ─────────────────────────────────────────────────────────────
// Stored as a set of Observations sharing a single effectiveDateTime.
// Codes: triage-qa (Q&A pairs), triage-urgency, triage-summary,
//        triage-safety-note, triage-locale

function triageObservation(patientId, code, valueString, effectiveDateTime, questionText) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: [{ coding: [{ system: SYS.SURVEY, code: 'survey', display: 'Survey' }] }],
    code: { coding: [{ system: SYS.TRIAGE, code }], ...(questionText ? { text: questionText.slice(0, 255) } : {}) },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueString: String(valueString || '').slice(0, 4000),
  };
}

async function writeTriageIntake(patientId, { locale, answers, urgency, summary, safety_note }) {
  if (!isConfigured()) return;
  const ts = new Date().toISOString();

  const observations = [
    ...(answers || [])
      .filter(({ q, a }) => q && a)
      .map(({ q, a }) => triageObservation(patientId, 'triage-qa', a, ts, q)),
    triageObservation(patientId, 'triage-urgency', urgency || 'routine', ts),
    triageObservation(patientId, 'triage-locale', locale || 'en', ts),
    ...(summary ? [triageObservation(patientId, 'triage-summary', summary, ts)] : []),
    ...(safety_note ? [triageObservation(patientId, 'triage-safety-note', safety_note, ts)] : []),
  ];

  console.log(`[healthlake] writeTriageIntake patient=${patientId} observations=${observations.length}`);
  const results = await Promise.allSettled(
    observations.map((obs) => fhirRequest('POST', 'Observation', obs)),
  );
  const failed = results.filter((r) => r.status === 'rejected');
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  console.log(`[healthlake] writeTriageIntake done: ${succeeded} ok, ${failed.length} failed`);
  if (failed.length) throw new Error(`Triage write partially failed: ${failed[0].reason?.message}`);
}

async function getTriageIntake(patientId) {
  if (!isConfigured()) return null;
  try {
    console.log(`[healthlake] getTriageIntake patient=${patientId}`);
    const result = await fhirRequest(
      'GET',
      `Observation?patient=${patientRef(patientId)}&code=${encodeURIComponent(SYS.TRIAGE + '|triage-urgency')}&_sort=-date&_count=1`,
    );
    console.log(`[healthlake] getTriageIntake urgency search: total=${result?.total} entries=${result?.entry?.length ?? 0}`);
    const latestUrgencyObs = result?.entry?.[0]?.resource;
    if (!latestUrgencyObs) {
      console.warn(`[healthlake] getTriageIntake: no triage-urgency Observation found for patient ${patientId}`);
      return null;
    }

    const effectiveDateTime = latestUrgencyObs.effectiveDateTime;
    console.log(`[healthlake] getTriageIntake: found urgency obs effectiveDateTime=${effectiveDateTime}`);

    const all = await fhirRequest(
      'GET',
      `Observation?patient=${patientRef(patientId)}&_sort=-date&_count=100`,
    );
    const allEntries = all?.entry ?? [];
    console.log(`[healthlake] getTriageIntake: all-obs search returned ${allEntries.length} entries`);

    const entries = allEntries.map((e) => e.resource).filter((r) =>
      r?.code?.coding?.some((c) => c.system === SYS.TRIAGE) &&
      r?.effectiveDateTime === effectiveDateTime,
    );
    console.log(`[healthlake] getTriageIntake: ${entries.length} triage entries match timestamp`);

    const byCode = (code) => entries.find((r) => r.code?.coding?.some((c) => c.code === code));
    const answers = entries
      .filter((r) => r.code?.coding?.some((c) => c.code === 'triage-qa'))
      .map((r) => ({ q: r.code?.text || '', a: r.valueString || '' }));

    return {
      answers,
      urgency: byCode('triage-urgency')?.valueString || 'routine',
      summary: byCode('triage-summary')?.valueString || null,
      safety_note: byCode('triage-safety-note')?.valueString || null,
      locale: byCode('triage-locale')?.valueString || 'en',
      updated_at: effectiveDateTime,
    };
  } catch (err) {
    console.warn('[healthlake] getTriageIntake failed:', err.message);
    return null;
  }
}

async function hasTriageIntake(patientId) {
  if (!isConfigured()) return false;
  try {
    const result = await fhirRequest(
      'GET',
      `Observation?patient=${patientRef(patientId)}&code=${encodeURIComponent(SYS.TRIAGE + '|triage-urgency')}&_count=1`,
    );
    return (result?.total ?? 0) > 0 || (result?.entry?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// ── Conditions ────────────────────────────────────────────────────────────────

async function writeConditions(patientId, knownConditions, recordedDate) {
  if (!isConfigured()) return;
  const items = String(knownConditions || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!items.length) return;
  const date = recordedDate || new Date().toISOString().slice(0, 10);
  await Promise.allSettled(items.map((text) =>
    fhirRequest('POST', 'Condition', {
      resourceType: 'Condition',
      subject: { reference: `Patient/${patientId}` },
      code: { text },
      clinicalStatus: { coding: [{ system: SYS.CONDITION_STATUS, code: 'active' }] },
      recordedDate: date,
    }),
  ));
}

async function getPatientConditions(patientId) {
  if (!isConfigured()) return [];
  try {
    const result = await fhirRequest('GET', `Condition?patient=${patientRef(patientId)}&_count=50`);
    const texts = (result?.entry ?? []).map((e) => e.resource?.code?.text).filter(Boolean);
    return [...new Set(texts)];
  } catch (err) {
    console.warn('[healthlake] getPatientConditions failed:', err.message);
    return [];
  }
}

// ── Allergies ─────────────────────────────────────────────────────────────────

async function writeAllergies(patientId, allergies) {
  if (!isConfigured()) return;
  const items = String(allergies || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!items.length) return;
  await Promise.allSettled(items.map((text) =>
    fhirRequest('POST', 'AllergyIntolerance', {
      resourceType: 'AllergyIntolerance',
      patient: { reference: `Patient/${patientId}` },
      code: { text },
      clinicalStatus: { coding: [{ system: SYS.ALLERGY_CLINICAL, code: 'active' }] },
      verificationStatus: { coding: [{ system: SYS.ALLERGY_VERIFY, code: 'unconfirmed' }] },
      type: 'allergy',
    }),
  ));
}

async function getPatientAllergies(patientId) {
  if (!isConfigured()) return [];
  try {
    const result = await fhirRequest('GET', `AllergyIntolerance?patient=${patientRef(patientId)}&_count=50`);
    const texts = (result?.entry ?? []).map((e) => e.resource?.code?.text).filter(Boolean);
    return [...new Set(texts)];
  } catch (err) {
    console.warn('[healthlake] getPatientAllergies failed:', err.message);
    return [];
  }
}

// ── MedicationStatements ──────────────────────────────────────────────────────

async function writeMedications(patientId, medications) {
  if (!isConfigured()) return;
  const items = String(medications || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!items.length) return;
  await Promise.allSettled(items.map((text) =>
    fhirRequest('POST', 'MedicationStatement', {
      resourceType: 'MedicationStatement',
      status: 'active',
      subject: { reference: `Patient/${patientId}` },
      medicationCodeableConcept: { text },
      effectivePeriod: { start: new Date().toISOString().slice(0, 10) },
    }),
  ));
}

async function getPatientMedications(patientId) {
  if (!isConfigured()) return [];
  try {
    const result = await fhirRequest('GET', `MedicationStatement?patient=${patientRef(patientId)}&_count=50`);
    const texts = (result?.entry ?? []).map((e) => e.resource?.medicationCodeableConcept?.text).filter(Boolean);
    return [...new Set(texts)];
  } catch (err) {
    console.warn('[healthlake] getPatientMedications failed:', err.message);
    return [];
  }
}

// ── Encounters ────────────────────────────────────────────────────────────────
// Clinical fields (urgency, summary, safety_note, answers) live here.
// Operational fields (doctor_id, source, status) stay in Supabase linked by fhir_encounter_id.

async function writeEncounter(patientId, encounter) {
  if (!isConfigured()) return null;
  const resource = {
    resourceType: 'Encounter',
    status: 'finished',
    class: { system: SYS.ACT, code: 'AMB', display: 'ambulatory' },
    subject: { reference: `Patient/${patientId}` },
    period: { start: encounter.created_at || new Date().toISOString() },
    ...(encounter.urgency ? {
      priority: { coding: [{ system: 'urn:ogwu:urgency', code: encounter.urgency }] },
    } : {}),
    ...(encounter.summary ? { reasonCode: [{ text: encounter.summary }] } : {}),
    note: [
      ...(encounter.safety_note ? [{ text: encounter.safety_note }] : []),
      ...(encounter.answers?.length ? [{ text: JSON.stringify(encounter.answers) }] : []),
    ],
  };
  const result = await fhirRequest('POST', 'Encounter', resource);
  return result?.id ?? null;
}

async function getEncounters(patientId) {
  if (!isConfigured()) return [];
  try {
    const result = await fhirRequest('GET', `Encounter?patient=${patientRef(patientId)}&_sort=-date&_count=50`);
    return (result?.entry ?? []).map((e) => {
      const r = e.resource;
      return {
        fhir_id: r.id,
        urgency: r.priority?.coding?.[0]?.code ?? 'routine',
        summary: r.reasonCode?.[0]?.text ?? null,
        safety_note: r.note?.find((n) => !n.text?.startsWith('['))?.text ?? null,
        created_at: r.period?.start ?? null,
      };
    });
  } catch (err) {
    console.warn('[healthlake] getEncounters failed:', err.message);
    return [];
  }
}

// ── ClinicalImpression (agent-generated consults) ─────────────────────────────

async function getClinicalImpressions(patientId, limit = 5) {
  if (!isConfigured()) return [];
  try {
    const lim = Math.max(1, Math.min(10, Number(limit)));
    const result = await fhirRequest(
      'GET',
      `ClinicalImpression?patient=${patientRef(patientId)}&_sort=-date&_count=${lim}`,
    );
    return (result?.entry ?? []).map((e) => {
      const r = e.resource;
      return {
        id: r.id,
        complaint: r.summary ?? null,
        urgency: r.extension?.find((x) => x.url === 'urn:ogwu:urgency')?.valueString ?? 'routine',
        care_pathway: r.note?.[0]?.text ?? null,
        created_at: r.date ?? null,
      };
    });
  } catch (err) {
    console.warn('[healthlake] getClinicalImpressions failed:', err.message);
    return [];
  }
}

async function writeClinicalImpression(patientId, consult) {
  if (!isConfigured()) return null;
  const result = await fhirRequest('POST', 'ClinicalImpression', {
    resourceType: 'ClinicalImpression',
    status: 'completed',
    subject: { reference: `Patient/${patientId}` },
    date: new Date().toISOString(),
    summary: consult.complaint,
    finding: (consult.symptoms || []).map((s) => ({ itemCodeableConcept: { text: s } })),
    note: [
      { text: consult.care_pathway || '' },
      ...(consult.recommended_specialty ? [{ text: `Specialty: ${consult.recommended_specialty}` }] : []),
    ],
    extension: [
      { url: 'urn:ogwu:urgency', valueString: consult.urgency || 'routine' },
      { url: 'urn:ogwu:emergency-flagged', valueBoolean: !!consult.is_emergency_flagged },
    ],
  });
  return result?.id ?? null;
}

module.exports = {
  isConfigured,
  upsertPatient,
  // Triage
  writeTriageIntake,
  getTriageIntake,
  hasTriageIntake,
  // Conditions / allergies / medications
  writeConditions,
  getPatientConditions,
  writeAllergies,
  getPatientAllergies,
  writeMedications,
  getPatientMedications,
  // Encounters
  writeEncounter,
  getEncounters,
  // Consults
  writeClinicalImpression,
  getClinicalImpressions,
};
