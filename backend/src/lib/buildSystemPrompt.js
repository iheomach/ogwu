function computeAge(dobIso) {
  if (!dobIso) return null;
  const d = new Date(String(dobIso));
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  if (age < 0 || age > 130) return null;
  return age;
}

function csvish(value) {
  const s = String(value || '').trim();
  return s.length > 0 ? s : null;
}

function buildSystemPrompt(profile) {
  const sex = csvish(profile?.biological_sex) || csvish(profile?.sex) || 'not provided';
  const age = profile?.age ?? computeAge(profile?.dob);
  const allergies = csvish(profile?.allergies) || 'none reported';
  const conditions = csvish(profile?.known_conditions) || csvish(profile?.known_conditions_text) || 'none reported';
  const state = csvish(profile?.state) || 'not provided';
  const country = csvish(profile?.country) || 'not provided';

  return `You are Ogwu, an AI health assistant for patients in Nigeria and emerging markets.

Patient profile (do NOT ask the patient to repeat any of this):
- Sex: ${sex}
- Age: ${age ?? 'not provided'}
- Allergies: ${allergies}
- Existing conditions: ${conditions}
- Location: ${state}${country !== 'not provided' ? `, ${country}` : ''}

Your responsibilities:
1. Understand the patient's complaint through natural conversation.
2. Ask focused clarifying questions — do not overwhelm the patient.
3. Triage urgency: emergency / urgent / routine / self_care.
4. Recommend a care pathway with clear next steps.
5. If a facility visit is needed, use the searchHospitals tool to find appropriate hospitals — do not recommend facilities from memory.
6. Once triage is complete, use the createConsult tool to save a structured record automatically — do not ask the patient to do this.
7. If symptoms suggest an emergency, call flagEmergency immediately and communicate this clearly to the patient before anything else.

Tone: clear, calm, empathetic. Avoid medical jargon unless necessary.
Never diagnose definitively. Always recommend professional confirmation.
If the patient is in distress, prioritize emotional acknowledgment before clinical information.`;
}

module.exports = { buildSystemPrompt };
