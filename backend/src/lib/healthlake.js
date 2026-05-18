'use strict';

/**
 * AWS HealthLake FHIR R4 client.
 *
 * All operations are no-ops when AWS_HEALTHLAKE_DATASTORE_ID is not set,
 * so the app works locally without HealthLake configured.
 *
 * Auth: IAM SigV4 via aws4. Credentials read from env:
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (default us-east-1)
 */

const aws4 = require('aws4');

const REGION = process.env.AWS_REGION || 'us-east-1';
const DATASTORE_ID = process.env.AWS_HEALTHLAKE_DATASTORE_ID || '';
const HOST = `healthlake.${REGION}.amazonaws.com`;
const BASE_PATH = `/datastore/${DATASTORE_ID}/r4`;

function isConfigured() {
  return !!DATASTORE_ID && !!process.env.AWS_ACCESS_KEY_ID;
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

async function fhirRequest(method, resourcePath, body) {
  const path = `${BASE_PATH}/${resourcePath}`;
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
  const res = await fetchImpl(`https://${HOST}${path}`, {
    method: opts.method,
    headers: opts.headers,
    body: opts.body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HealthLake ${method} ${resourcePath} → ${res.status}: ${text.slice(0, 400)}`);
  }

  return res.json();
}

// ── Patient ───────────────────────────────────────────────────────────────────

function patientResource(profile) {
  const genderMap = { male: 'male', female: 'female', other: 'other' };
  const sex = String(profile.biological_sex || profile.sex || '').toLowerCase();
  return {
    resourceType: 'Patient',
    identifier: [{ system: 'urn:ogwu:patient', value: profile.id }],
    name: [{ family: profile.last_name || '', given: [profile.first_name || ''] }],
    gender: genderMap[sex] ?? 'unknown',
    ...(profile.dob ? { birthDate: String(profile.dob).slice(0, 10) } : {}),
  };
}

// PUT creates-or-updates using the Supabase user ID as the stable FHIR Patient ID.
async function upsertPatient(profile) {
  if (!isConfigured()) return null;
  return fhirRequest('PUT', `Patient/${profile.id}`, patientResource(profile));
}

// ── Observations (triage Q&A) ─────────────────────────────────────────────────

function observationResource(patientId, question, answer, effectiveDateTime) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: [{
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey', display: 'Survey' }],
    }],
    code: { text: question.slice(0, 255) },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueString: answer.slice(0, 4000),
  };
}

async function writeTriageObservations(patientId, answers, effectiveDateTime) {
  if (!isConfigured()) return;
  const ts = effectiveDateTime || new Date().toISOString();
  const writes = (answers || [])
    .filter(({ q, a }) => q && a)
    .map(({ q, a }) => fhirRequest('POST', 'Observation', observationResource(patientId, q, a, ts)));
  await Promise.allSettled(writes);
}

// ── Conditions ────────────────────────────────────────────────────────────────

function conditionResource(patientId, text, recordedDate) {
  return {
    resourceType: 'Condition',
    subject: { reference: `Patient/${patientId}` },
    code: { text },
    clinicalStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
    },
    recordedDate,
  };
}

async function writeConditions(patientId, knownConditions, recordedDate) {
  if (!isConfigured()) return;
  const conditions = String(knownConditions || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!conditions.length) return;
  const date = recordedDate || new Date().toISOString().slice(0, 10);
  const writes = conditions.map((c) => fhirRequest('POST', 'Condition', conditionResource(patientId, c, date)));
  await Promise.allSettled(writes);
}

// ── MedicationStatements ──────────────────────────────────────────────────────

function medicationStatementResource(patientId, text) {
  return {
    resourceType: 'MedicationStatement',
    status: 'active',
    subject: { reference: `Patient/${patientId}` },
    medicationCodeableConcept: { text },
    effectivePeriod: { start: new Date().toISOString().slice(0, 10) },
  };
}

async function writeMedications(patientId, medications) {
  if (!isConfigured()) return;
  const meds = String(medications || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!meds.length) return;
  const writes = meds.map((m) => fhirRequest('POST', 'MedicationStatement', medicationStatementResource(patientId, m)));
  await Promise.allSettled(writes);
}

// ── Encounters ────────────────────────────────────────────────────────────────

function encounterResource(patientId, encounter) {
  return {
    resourceType: 'Encounter',
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    subject: { reference: `Patient/${patientId}` },
    ...(encounter.summary ? { reasonCode: [{ text: encounter.summary }] } : {}),
    period: { start: encounter.created_at || new Date().toISOString() },
  };
}

async function writeEncounter(patientId, encounter) {
  if (!isConfigured()) return null;
  return fhirRequest('POST', 'Encounter', encounterResource(patientId, encounter));
}

// ── Queries ───────────────────────────────────────────────────────────────────

async function getPatientConditions(patientId) {
  if (!isConfigured()) return [];
  try {
    const result = await fhirRequest('GET', `Condition?patient=Patient%2F${patientId}&_count=50`);
    const texts = (result?.entry ?? []).map((e) => e.resource?.code?.text).filter(Boolean);
    return [...new Set(texts)];
  } catch (err) {
    console.warn('[healthlake] getPatientConditions failed:', err.message);
    return [];
  }
}

async function getPatientMedications(patientId) {
  if (!isConfigured()) return [];
  try {
    const result = await fhirRequest('GET', `MedicationStatement?patient=Patient%2F${patientId}&_count=50`);
    const texts = (result?.entry ?? []).map((e) => e.resource?.medicationCodeableConcept?.text).filter(Boolean);
    return [...new Set(texts)];
  } catch (err) {
    console.warn('[healthlake] getPatientMedications failed:', err.message);
    return [];
  }
}

module.exports = {
  isConfigured,
  upsertPatient,
  writeTriageObservations,
  writeConditions,
  writeMedications,
  writeEncounter,
  getPatientConditions,
  getPatientMedications,
};
