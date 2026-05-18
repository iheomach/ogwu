'use strict';

/**
 * AWS Comprehend Medical — ICD-10-CM entity extraction for triage grounding.
 *
 * Calls InferICD10CM on concatenated triage answers (one API call per session).
 * Returns structured entities with emergency/urgent flags so computeUrgency can
 * weight ICD-10-grounded signals more heavily than keyword matching alone.
 *
 * No-op when AWS_ACCESS_KEY_ID is unset (local dev / Supabase fallback path).
 */

const { ComprehendMedicalClient, InferICD10CMCommand } = require('@aws-sdk/client-comprehendmedical');

const REGION = process.env.AWS_REGION || 'us-east-1';
const ENTITY_MIN_SCORE = 0.80; // entity-level confidence — the meaningful gate

// ICD-10-CM prefixes that map to immediately life-threatening conditions.
// Matching any of these in a high-confidence entity upgrades urgency to emergency.
const EMERGENCY_PREFIXES = [
  'I21', 'I22', 'I24',        // Acute MI / ACS
  'I26',                       // Pulmonary embolism
  'I46',                       // Cardiac arrest
  'I16',                       // Hypertensive crisis
  'I60', 'I61', 'I62',        // Intracranial hemorrhage
  'I63', 'I64',                // Stroke
  'I71',                       // Aortic aneurysm / dissection
  'J80',                       // ARDS
  'J93',                       // Pneumothorax (tension pneumothorax is immediately fatal)
  'J96',                       // Respiratory failure
  'G41',                       // Status epilepticus
  'A41',                       // Sepsis
  'E10.1',                     // Diabetic ketoacidosis (type 1)
  'O00',                       // Ectopic pregnancy (rupture → haemorrhagic shock)
  'K92.0', 'K92.1',           // Haematemesis / melaena (severe GI bleed)
  'R09.0', 'R09.2',           // Asphyxiation / respiratory arrest
  'R55',                       // Syncope / collapse
  'R56',                       // Convulsions / seizures
  'R57',                       // Shock (cardiogenic, hypovolaemic, septic)
  'T30', 'T31',               // Major burns
  'T36', 'T37', 'T38', 'T39', // Poisoning — drugs
  'T40', 'T41', 'T42', 'T43', // Poisoning — narcotics / psychotropics
  'T44', 'T45', 'T46',        // Poisoning — cardiac / hematological agents
  'T58', 'T59', 'T65',        // Carbon monoxide / toxic gas / other toxic effects
  'T71',                       // Asphyxiation
  'T78.0', 'T78.2',           // Anaphylactic reaction / shock
];

// ICD-10-CM prefixes that map to urgent (not emergency) conditions.
// Matching these when current urgency is routine/soon upgrades to urgent.
const URGENT_PREFIXES = [
  'K35', 'K36', 'K37',        // Appendicitis
  'K25', 'K26', 'K27',        // Peptic ulcer disease
  'K85',                       // Acute pancreatitis
  'N20', 'N21',                // Kidney / ureter stones
  'J18',                       // Pneumonia
  'J44.1',                     // COPD acute exacerbation
  'J45',                       // Asthma
  'N39.0',                     // UTI (systemic risk)
  'A09',                       // Infectious gastroenteritis
  'E11.6', 'E11.65',          // Diabetic foot / complications
  'G43',                       // Migraine
  'M54.5',                     // Low back pain (severe)
  'I50',                       // Heart failure (acute decompensated)
  'N17',                       // Acute kidney injury
  'R00',                       // Palpitations / abnormal heart rate
  'R04',                       // Haemorrhage from respiratory passages (coughing blood)
  'R06',                       // Breathing difficulty / dyspnoea
  'R07',                       // Chest pain (symptom-level — not yet coded as ACS)
  'R10',                       // Abdominal pain
  'R11',                       // Nausea and vomiting
  'R31',                       // Haematuria
  'R41',                       // Altered consciousness / confusion
  'R42',                       // Dizziness / vertigo
  'R51',                       // Headache
];

function isConfigured() {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_REGION);
}

function getClient() {
  return new ComprehendMedicalClient({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

function matchesPrefix(code, prefixes) {
  if (!code) return false;
  return prefixes.some((p) => code === p || code.startsWith(p + '.'));
}

async function extractEntitiesFromAnswers(answers) {
  if (!isConfigured() || !Array.isArray(answers) || answers.length === 0) {
    return { entities: [], emergencySignaled: false, urgentSignaled: false };
  }

  // One API call: concatenate all Q&A pairs (HealthLake pricing: per 100 chars)
  const text = answers
    .filter(({ q, a }) => q && a)
    .map(({ q, a }) => `${q} ${a}`)
    .join('. ')
    .slice(0, 10000);

  if (!text.trim()) return { entities: [], emergencySignaled: false, urgentSignaled: false };

  try {
    const client = getClient();
    const { Entities = [] } = await client.send(new InferICD10CMCommand({ Text: text }));

    const entities = Entities
      .filter((e) => (e.Score ?? 0) >= ENTITY_MIN_SCORE)
      .map((e) => {
        const topConcept = (e.ICD10CMConcepts ?? [])
          .sort((a, b) => (b.Score ?? 0) - (a.Score ?? 0))[0] ?? null;

        return {
          text: e.Text,
          score: Math.round((e.Score ?? 0) * 100) / 100,
          type: e.Type ?? null,
          icd10Code: topConcept?.Code ?? null,
          icd10Description: topConcept?.Description ?? null,
          icd10Score: topConcept ? Math.round((topConcept.Score ?? 0) * 100) / 100 : null,
          isEmergency: matchesPrefix(topConcept?.Code, EMERGENCY_PREFIXES),
          isUrgent: matchesPrefix(topConcept?.Code, URGENT_PREFIXES),
        };
      });

    const emergencySignaled = entities.some((e) => e.isEmergency);
    const urgentSignaled = entities.some((e) => e.isUrgent);

    console.log(`[comprehendMedical] ${entities.length} entities (emergency=${emergencySignaled} urgent=${urgentSignaled})`);
    return { entities, emergencySignaled, urgentSignaled };
  } catch (err) {
    console.warn('[comprehendMedical] InferICD10CM failed:', err.message);
    return { entities: [], emergencySignaled: false, urgentSignaled: false };
  }
}

module.exports = { extractEntitiesFromAnswers, isConfigured };
