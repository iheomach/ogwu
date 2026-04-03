const express = require('express');
const router = express.Router();

const supabase = require('../lib/supabase');
const authenticate = require('../middleware/auth');

const fetchImpl = global.fetch || require('node-fetch');

const MAX_QUESTIONS = 5;

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s+/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasEmergencySignals(allText) {
  const t = normalizeText(allText);
  if (!t) return false;

  // Very small heuristic set; we prefer false negatives over false positives.
  const needles = [
    'chest pain',
    'pressure in chest',
    'trouble breathing',
    'cant breathe',
    "can't breathe",
    'shortness of breath',
    'severe bleeding',
    'bleeding a lot',
    'passed out',
    'fainted',
    'confusion',
    'slurred speech',
    'weakness on one side',
    'seizure',
    'suicidal',
    'kill myself',
    'overdose',
  ];
  return needles.some((n) => t.includes(n));
}

function safetyNote(localeSafe) {
  switch (localeSafe) {
    case 'fr':
      return "Vos symptômes peuvent être urgents. Veuillez appeler les services d'urgence locaux ou vous rendre aux urgences immédiatement.";
    case 'es':
      return 'Tus síntomas podrían ser una urgencia. Llama a los servicios de emergencia locales o acude a urgencias de inmediato.';
    case 'ig':
      return 'Ihe ị kọwara nwere ike ịbụ mberede. Biko kpọọ ndị enyemaka mberede ma ọ bụ gaa ụlọ ọgwụ ozugbo.';
    case 'yo':
      return 'Àwọn ààmì tó o sọ lè jẹ́ pajawiri. Jọ̀wọ́ pe àwọn iṣẹ́ pajawiri tàbí lọ sí ilé ìwòsàn lẹ́sẹ̀kẹsẹ.';
    case 'ha':
      return 'Alamomin da ka bayyana na iya zama gaggawa. Da fatan za a kira agajin gaggawa ko ku je asibiti nan da nan.';
    default:
      return 'Your symptoms may be urgent. Please call local emergency services or go to the emergency department immediately.';
  }
}

function q(localeSafe, key) {
  const en = {
    main: 'What is your main concern today (in one sentence)?',
    onset: 'When did this start (today / days / weeks / months), and is it getting better, worse, or staying the same?',
    severity:
      'How severe is it right now on a 0–10 scale? Any red flags like trouble breathing, chest pain, fainting, confusion, or uncontrolled bleeding?',
    pain:
      'Where exactly is the pain or symptom located, and does it spread anywhere else?',
    breathing: 'Do you have cough, wheezing, or shortness of breath? If yes, what triggers it and how bad is it?',
    gi: 'Any nausea, vomiting, diarrhea, or stomach pain? Are you able to keep fluids down?',
    urinary: 'Any burning with urination, frequent urination, or blood in urine?',
    skin: 'Any rash, swelling, or itching? When did it start and has it spread?',
    other: 'What other symptoms are you having (fever, chills, headache, dizziness, weakness, numbness)?',
    meds: 'What medications or supplements are you taking now, and what have you tried so far for this problem?',
  };

  const es = {
    main: '¿Cuál es tu principal motivo de consulta hoy (en una sola frase)?',
    onset: '¿Cuándo comenzó (hoy / días / semanas / meses) y está mejorando, empeorando o igual?',
    severity:
      '¿Qué tan fuerte es ahora en una escala de 0 a 10? ¿Alguna señal de alarma como falta de aire, dolor en el pecho, desmayo, confusión o sangrado incontrolable?',
    pain: '¿Dónde exactamente está el dolor o síntoma y se irradia a otra parte?',
    breathing: '¿Tienes tos, sibilancias o falta de aire? Si sí, ¿qué lo empeora y qué tan intenso es?',
    gi: '¿Náuseas, vómitos, diarrea o dolor abdominal? ¿Puedes mantener líquidos?',
    urinary: '¿Ardor al orinar, orinar con frecuencia o sangre en la orina?',
    skin: '¿Sarpullido, hinchazón o picazón? ¿Cuándo empezó y se ha extendido?',
    other: '¿Qué otros síntomas tienes (fiebre, escalofríos, dolor de cabeza, mareos, debilidad, entumecimiento)?',
    meds: '¿Qué medicamentos o suplementos tomas ahora y qué has probado hasta ahora para esto?',
  };

  const fr = {
    main: "Quel est votre principal problème aujourd'hui (en une phrase) ?",
    onset: "Quand cela a-t-il commencé (aujourd'hui / jours / semaines / mois) et est-ce que ça s'améliore, s'aggrave ou reste stable ?",
    severity:
      "Quelle est l'intensité maintenant sur une échelle de 0 à 10 ? Y a-t-il des signes d'alarme (difficulté à respirer, douleur thoracique, malaise, confusion, saignement important) ?",
    pain: "Où se situe exactement la douleur/le symptôme, et est-ce que ça irradie ailleurs ?",
    breathing: "Avez-vous de la toux, des sifflements ou un essoufflement ? Si oui, qu'est-ce qui déclenche et quelle est l'intensité ?",
    gi: "Avez-vous des nausées, vomissements, diarrhée ou des douleurs abdominales ? Pouvez-vous garder des liquides ?",
    urinary: "Brûlures en urinant, envies fréquentes, ou sang dans les urines ?",
    skin: "Éruption, gonflement ou démangeaisons ? Quand cela a-t-il commencé et est-ce que ça s'étend ?",
    other: "Quels autres symptômes avez-vous (fièvre, frissons, maux de tête, vertiges, faiblesse, engourdissement) ?",
    meds: "Quels médicaments ou compléments prenez-vous actuellement, et qu'avez-vous déjà essayé pour ce problème ?",
  };

  // Lightweight fallbacks for locales without full question translations.
  const table = localeSafe === 'es' ? es : localeSafe === 'fr' ? fr : en;
  return table[key] || en[key] || en.main;
}

function pickBranchKey(mainComplaintText) {
  const t = normalizeText(mainComplaintText);
  if (!t) return 'other';

  if (/(pain|ache|hurt|cramp|sore|migraine|headache|back pain|abdominal pain)/.test(t)) return 'pain';
  if (/(breath|breathing|cough|asthma|wheeze|shortness)/.test(t)) return 'breathing';
  if (/(vomit|vomiting|nausea|diarrhea|stomach|abdominal|belly)/.test(t)) return 'gi';
  if (/(urine|urinary|pee|burning|uti)/.test(t)) return 'urinary';
  if (/(rash|hives|swelling|itch|itching|skin)/.test(t)) return 'skin';
  return 'other';
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getModel() {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

function safeLocale(locale) {
  const l = String(locale || 'en').toLowerCase();
  // Keep it simple: allow short language codes; fallback to en.
  if (/^(en|es|fr|ig|yo|ha)([-_].+)?$/.test(l)) return l.split(/[-_]/)[0];
  return 'en';
}

async function openaiChat({ locale, messages }) {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getModel(),
      temperature: 0.4,
      messages,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM request failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM returned no content');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('LLM returned non-JSON content');
  }

  return parsed;
}

// Returns the next question (or done=true)
router.post('/next', authenticate, async (req, res) => {
  try {
    const locale = safeLocale(req.body?.locale);
    const profile = req.body?.profile || {};
    const qa = Array.isArray(req.body?.qa) ? req.body.qa : [];

    // Rule-based question gathering: do NOT call OpenAI here.
    const allUserText = qa.map((x) => (x && typeof x.a === 'string' ? x.a : '')).join(' ');
    if (hasEmergencySignals(allUserText)) {
      return res.json({ done: true, question: null, summary: null, safety_note: safetyNote(locale) });
    }

    if (qa.length >= MAX_QUESTIONS) {
      return res.json({ done: true, question: null, summary: null, safety_note: null });
    }

    const step = qa.length;
    if (step === 0) {
      return res.json({ done: false, question: q(locale, 'main'), summary: null, safety_note: null });
    }
    if (step === 1) {
      return res.json({ done: false, question: q(locale, 'onset'), summary: null, safety_note: null });
    }
    if (step === 2) {
      return res.json({ done: false, question: q(locale, 'severity'), summary: null, safety_note: null });
    }
    if (step === 3) {
      const mainComplaint = qa?.[0]?.a || '';
      const key = pickBranchKey(mainComplaint);
      return res.json({ done: false, question: q(locale, key), summary: null, safety_note: null });
    }

    // step === 4 (final question)
    return res.json({ done: false, question: q(locale, 'meds'), summary: null, safety_note: null });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to generate triage question' });
  }
});

// Saves the completed intake
router.post('/complete', authenticate, async (req, res) => {
  try {
    const locale = safeLocale(req.body?.locale);
    const profile = req.body?.profile || {};
    const qa = Array.isArray(req.body?.qa) ? req.body.qa : [];

    const trimmed = qa
      .filter((x) => x && typeof x.q === 'string')
      .slice(0, MAX_QUESTIONS)
      .map((x) => ({
        q: String(x.q).slice(0, 280),
        a: typeof x.a === 'string' ? String(x.a).slice(0, 2000) : '',
      }));

    // Ask the model for a short summary (still no advice)
    const messages = [
      {
        role: 'system',
        content:
          `Summarize the following patient intake in 4-6 bullets. ` +
          `No diagnosis, no treatment advice. ` +
          `If emergency symptoms are present, include a first bullet saying they should seek urgent care. ` +
          `Return ONLY JSON: { "summary": string, "safety_note": string|null }.`,
      },
      {
        role: 'user',
        content: JSON.stringify({ locale, profile, answers: trimmed }),
      },
    ];

    let summary = null;
    let safety_note = null;
    try {
      const parsed = await openaiChat({ locale, messages });
      summary = typeof parsed?.summary === 'string' ? parsed.summary : null;
      safety_note = typeof parsed?.safety_note === 'string' ? parsed.safety_note : null;
    } catch {
      // Non-fatal: we can still save answers.
    }

    const { data, error } = await supabase
      .from('triage_intakes')
      .upsert(
        {
          user_id: req.user.id,
          locale,
          answers: trimmed,
          summary,
        },
        { onConflict: 'user_id' }
      )
      .select('user_id, locale, answers, summary, created_at, updated_at')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ intake: data, safety_note });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to save triage intake' });
  }
});

// Checks whether triage is completed
router.get('/status', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('triage_intakes')
      .select('user_id')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ completed: !!data });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to load triage status' });
  }
});

// Returns the saved triage intake (or null)
router.get('/intake', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('triage_intakes')
      .select('user_id, locale, answers, summary, created_at, updated_at')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ intake: data ?? null });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to load triage intake' });
  }
});

module.exports = router;
