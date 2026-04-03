const express = require('express');
const router = express.Router();

const supabase = require('../lib/supabase');
const authenticate = require('../middleware/auth');

const fetchImpl = global.fetch || require('node-fetch');

const MAX_QUESTIONS = 5;

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

function buildPrompt({ locale, profile, qa }) {
  const languageMap = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    ig: 'Igbo',
    yo: 'Yoruba',
    ha: 'Hausa',
  };

  const localeSafe = safeLocale(locale);
  const languageName = languageMap[localeSafe] || 'English';

  const system = {
    role: 'system',
    content:
      `You are an intake assistant for a telehealth app. ` +
      `Ask ONE short clarifying question at a time to collect info a new doctor intake form would ask. ` +
      `Be respectful and keep the process short: maximum ${MAX_QUESTIONS} questions total. ` +
      `Do NOT diagnose, prescribe, or give medical advice. ` +
      `If the user mentions emergency symptoms (e.g. chest pain, severe bleeding, trouble breathing), ` +
      `respond with done=true and include a safety_note telling them to seek emergency help. ` +
      `Return ONLY JSON with this shape: ` +
      `{ "done": boolean, "question": string|null, "summary": string|null, "safety_note": string|null }.` +
      `The question must be answerable in a short text field. ` +
      `Write in ${languageName}.`,
  };

  const user = {
    role: 'user',
    content: JSON.stringify({
      goal: 'Collect a quick patient intake',
      max_questions: MAX_QUESTIONS,
      already_answered_count: qa.length,
      patient_profile: {
        country_of_residence: profile?.country || null,
        dob: profile?.dob || null,
        biological_sex: profile?.biological_sex || null,
        allergies: profile?.allergies || null,
        known_conditions: profile?.known_conditions || null,
      },
      conversation: qa,
      guidance:
        'Prioritize country of residence, family history, current concerns/symptoms, medications, and any red flags. Avoid long multi-part questions.',
    }),
  };

  return [system, user];
}

// Returns the next question (or done=true)
router.post('/next', authenticate, async (req, res) => {
  try {
    const locale = safeLocale(req.body?.locale);
    const profile = req.body?.profile || {};
    const qa = Array.isArray(req.body?.qa) ? req.body.qa : [];

    if (qa.length >= MAX_QUESTIONS) {
      return res.json({ done: true, question: null, summary: null, safety_note: null });
    }

    const messages = buildPrompt({ locale, profile, qa });
    const parsed = await openaiChat({ locale, messages });

    const done = !!parsed?.done;
    const question = typeof parsed?.question === 'string' ? parsed.question : null;
    const summary = typeof parsed?.summary === 'string' ? parsed.summary : null;
    const safety_note = typeof parsed?.safety_note === 'string' ? parsed.safety_note : null;

    // If model claims not done but didn't produce a question, force a safe fallback.
    if (!done && (!question || question.trim().length === 0)) {
      return res.json({
        done: false,
        question:
          locale === 'fr'
            ? 'Quel est votre pays de résidence ?'
            : locale === 'es'
              ? '¿Cuál es tu país de residencia?'
              : 'What country do you live in?',
        summary: null,
        safety_note: null,
      });
    }

    return res.json({ done, question, summary, safety_note });
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
