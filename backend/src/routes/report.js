const express = require('express');
const { generateText } = require('ai');
const { openai } = require('@ai-sdk/openai');
const router = express.Router();

const supabase = require('../lib/supabase');
const authenticate = require('../middleware/auth');
const healthlake = require('../lib/healthlake');
const serverError = require('../lib/serverError');

function computeAge(dobIso) {
  if (!dobIso) return null;
  const d = new Date(dobIso);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age <= 130 ? age : null;
}

function fmt(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

async function generateClinicalNarrative(profile, intake, consults) {
  const age = profile ? computeAge(profile.dob) : null;
  const name = profile
    ? [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ')
    : 'The patient';
  const pronoun = profile?.biological_sex === 'Female' ? 'She' : profile?.biological_sex === 'Male' ? 'He' : 'They';
  const possessive = profile?.biological_sex === 'Female' ? 'her' : profile?.biological_sex === 'Male' ? 'his' : 'their';

  const intakeBlock = intake
    ? `Urgency tier: ${intake.urgency}\nSummary: ${intake.summary || 'N/A'}\nSafety note: ${intake.safety_note || 'None'}\nQ&A:\n${intake.answers.map((qa, i) => `${i + 1}. Q: ${qa.q}\n   A: ${qa.a}`).join('\n')}`
    : 'No intake on file.';

  const consultsBlock = consults.length > 0
    ? consults.map((c, i) => `Session ${i + 1} (${fmt(c.created_at)}): Complaint: ${c.complaint}. Urgency: ${c.urgency}. Symptoms: ${(c.symptoms || []).join(', ') || 'N/A'}. Specialty recommended: ${c.recommended_specialty || 'N/A'}. Care pathway: ${c.care_pathway || 'N/A'}.`).join('\n')
    : 'No prior AI assistant sessions.';

  const prompt = `You are a clinical documentation assistant. Write a structured patient summary report in the third person, suitable for a receiving healthcare provider (GP, specialist, or emergency clinician).

PATIENT DATA:
Name: ${name}
Age: ${age ?? 'Unknown'}
Biological sex: ${profile?.biological_sex || 'Not specified'}
Date of birth: ${profile?.dob ? fmt(profile.dob) : 'Unknown'}
Known allergies: ${profile?.allergies || 'None reported'}
Known conditions: ${profile?.known_conditions || 'None reported'}

HEALTH CHECK-IN DATA:
${intakeBlock}

AI ASSISTANT SESSIONS:
${consultsBlock}

Write the following sections using clinical third-person language. Be concise but thorough. Do not use bullet points in the narrative sections — write in flowing prose. Use the patient's name and correct pronouns throughout. Do not use any markdown formatting (no **, no *, no #, no dashes as list markers).

Sections to produce (output exactly these headings):

CHIEF COMPLAINT
One sentence describing the primary reason the patient is seeking care, derived from the check-in and sessions.

HISTORY OF PRESENT ILLNESS
A 3-5 sentence clinical narrative (OPQRST style where data allows): onset, character, severity, duration, associated symptoms, and any aggravating/relieving factors mentioned.

REVIEW OF SYSTEMS
Organised by body system. Only include systems with relevant findings. Mark each system as "Positive:" or "Negative:" followed by the finding.

PAST MEDICAL & SURGICAL HISTORY
Known conditions. If none, state "No known medical history reported."

ALLERGIES & ADVERSE REACTIONS
List allergies. If none, state "No known allergies."

CLINICAL IMPRESSION
2-3 sentences synthesising the presentation. State the urgency tier and what it implies clinically. Do not diagnose — frame as "consistent with" or "may suggest."

RECOMMENDED NEXT STEPS
2-3 sentences on appropriate next steps based on urgency and presentation.`;

  const { text } = await generateText({
    model: openai('gpt-4o'),
    prompt,
    maxTokens: 1200,
  });

  return text;
}

// GET /api/report
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const [profileRes, intake, consults, appointmentsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('first_name, middle_name, last_name, dob, biological_sex, allergies, known_conditions')
        .eq('id', userId)
        .maybeSingle(),
      healthlake.getTriageIntake(userId),
      healthlake.getClinicalImpressions(userId, 5),
      supabase
        .from('appointments')
        .select('starts_at, duration_minutes, status, meeting_url, reason, hospital_id, created_at')
        .eq('patient_id', userId)
        .order('starts_at', { ascending: false })
        .limit(5),
    ]);

    const appointments = appointmentsRes.data || [];
    const hospitalIds = [...new Set(appointments.map((a) => a.hospital_id).filter(Boolean))];
    let hospitalsMap = {};
    if (hospitalIds.length > 0) {
      const { data: hospitals } = await supabase
        .from('hospitals_directory')
        .select('id, name')
        .in('id', hospitalIds);
      if (hospitals) hospitalsMap = Object.fromEntries(hospitals.map((h) => [h.id, h.name]));
    }

    const profile = profileRes.data || null;
    const narrative = await generateClinicalNarrative(profile, intake, consults || []);

    return res.json({
      profile,
      intake: intake || null,
      consults: consults || [],
      appointments: appointments.map((a) => ({ ...a, hospital_name: hospitalsMap[a.hospital_id] || null })),
      narrative,
    });
  } catch (e) {
    return serverError(res, e, 'Failed to generate report.');
  }
});

module.exports = router;
