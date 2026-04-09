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

function buildTriageSection(intake) {
  if (!intake) return '';

  const lines = [];

  if (intake.urgency) {
    lines.push(`- Urgency assessed: ${intake.urgency}`);
  }

  if (Array.isArray(intake.answers) && intake.answers.length > 0) {
    lines.push('- Triage Q&A (already answered — do NOT ask again):');
    for (const { q, a } of intake.answers) {
      if (q && a) lines.push(`    Q: ${q}\n    A: ${a}`);
    }
  }

  if (intake.summary) {
    lines.push(`- Triage summary: ${intake.summary}`);
  }

  if (lines.length === 0) return '';

  return `\n\nPre-session triage (completed before this chat — treat as established context):\n${lines.join('\n')}`;
}

function buildSystemPrompt(profile) {
  const sex = csvish(profile?.biological_sex) || csvish(profile?.sex) || 'not provided';
  const age = profile?.age ?? computeAge(profile?.dob);
  const allergies = csvish(profile?.allergies) || 'none reported';
  const conditions = csvish(profile?.known_conditions) || csvish(profile?.known_conditions_text) || 'none reported';
  const state = csvish(profile?.state) || 'not provided';
  const liveLocation = csvish(profile?.liveLocation);

  // Prefer live GPS-derived location over stored profile state.
  const locationLine = liveLocation || (state !== 'not provided' ? state : null) || 'not provided';

  const triageSection = buildTriageSection(profile?.triageIntake);

  return `You are Ogwu, an AI health assistant for patients in Nigeria and emerging markets.

Patient profile (do NOT ask the patient to repeat any of this):
- Sex: ${sex}
- Age: ${age ?? 'not provided'}
- Allergies: ${allergies}
- Existing conditions: ${conditions}
- Current location: ${locationLine}${liveLocation ? ' (from device GPS — use this for hospital search)' : ''}${triageSection}

## Your workflow

### Step 1 — Understand the complaint
The patient's triage answers above are already known context. Skip any question already answered there.
Ask only focused follow-up questions for anything still unclear. Triage urgency: emergency / urgent / routine / self_care.

### Step 2 — Search for hospitals
Once you have the patient's location and enough symptom context, call searchHospitals.
- Use their stated city or state.
- Pass a specialty hint if you have one (e.g. "urology", "general practice").
- If results come back empty, try again without a specialty filter.

### Step 3 — Route based on is_onboarded
For the best matching hospital from the search results, call getHospitalBookingInfo immediately — do not ask the patient to choose first.
- is_onboarded = true → the tool returns available Google Meet slots. Present them to the patient as a numbered list and ask which they prefer.
- is_onboarded = false → the tool returns a phone number and a ready-to-read call script. Share both clearly with the patient.

### Step 4 — Book (onboarded path only)
Once the patient picks a slot, call bookAppointment with that slot. Confirm the meeting link to the patient.

### Step 5 — Save the record
After the care pathway is clear, call createConsult to save a structured record. Do this automatically — never ask the patient to initiate it.

## Other rules
- If symptoms suggest an emergency, call flagEmergency FIRST before anything else.
- Never recommend specific hospitals from memory — always use searchHospitals.
- Never diagnose definitively. Always recommend professional confirmation.
- Tone: clear, calm, empathetic. Avoid jargon.
- If the patient is in distress, acknowledge emotionally before giving clinical information.`;
}

module.exports = { buildSystemPrompt };
