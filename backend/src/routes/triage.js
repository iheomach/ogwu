'use strict';

const serverError = require('../lib/serverError');
const express = require('express');
const router = express.Router();

const { generateText } = require('ai');
const { openai } = require('@ai-sdk/openai');
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/auth');
const healthlake = require('../lib/healthlake');
const cache = require('../lib/cache');
const { runTriageNext, runTriageComplete } = require('../lib/triageGraph');

function safeLocale(locale) {
  const l = String(locale || 'en').toLowerCase();
  if (/^(en|es|fr|ig|yo|ha)([-_].+)?$/.test(l)) return l.split(/[-_]/)[0];
  return 'en';
}

function trimAnswers(qa) {
  const max = parseInt(process.env.TRIAGE_MAX_QUESTIONS || '10', 10);
  return (Array.isArray(qa) ? qa : [])
    .filter((x) => x && typeof x.q === 'string')
    .slice(0, max)
    .map((x) => ({
      q: String(x.q).slice(0, 280),
      a: typeof x.a === 'string' ? String(x.a).slice(0, 2000) : '',
    }));
}

// Returns the next question, or done=true when the graph signals the interview is complete.
router.post('/next', authenticate, async (req, res) => {
  try {
    const locale = safeLocale(req.body?.locale);
    const profile = req.body?.profile || {};
    const qa = Array.isArray(req.body?.qa) ? req.body.qa : [];
    const { done, question } = await runTriageNext({ locale, profile, answers: qa });
    return res.json({ done, question, summary: null, safety_note: null });
  } catch (err) {
    return serverError(res, err, 'Failed to generate triage question.', 400);
  }
});

// Runs the completion chain (Comprehend → urgency → summarize → write) and returns the intake.
router.post('/complete', authenticate, async (req, res) => {
  try {
    const locale = safeLocale(req.body?.locale);
    const profile = req.body?.profile || {};
    const location = typeof req.body?.location === 'string' ? req.body.location.trim() : null;
    const answers = trimAnswers(req.body?.qa);

    const { intake, safety_note } = await runTriageComplete({
      locale,
      profile,
      answers,
      location,
      patientId: req.user.id,
    });

    return res.json({ intake, safety_note });
  } catch (err) {
    return serverError(res, err, 'Failed to save triage intake.', 400);
  }
});

// Returns whether triage has been completed for this patient.
router.get('/status', authenticate, async (req, res) => {
  try {
    if (healthlake.isConfigured()) {
      const completed = await healthlake.hasTriageIntake(req.user.id);
      return res.json({ completed });
    }
    const { data, error } = await supabase
      .from('triage_intakes').select('user_id').eq('user_id', req.user.id).maybeSingle();
    if (error) return serverError(res, error, 'An error occurred.', 400);
    return res.json({ completed: !!data });
  } catch (err) {
    return serverError(res, err, 'Failed to load triage status.', 400);
  }
});

// Returns the saved triage intake (or null if not completed).
router.get('/intake', authenticate, async (req, res) => {
  try {
    if (healthlake.isConfigured()) {
      const intake = await healthlake.getTriageIntake(req.user.id);
      return res.json({ intake: intake ?? null });
    }
    const { data, error } = await supabase
      .from('triage_intakes')
      .select('user_id, locale, answers, urgency, summary, safety_note, created_at, updated_at')
      .eq('user_id', req.user.id).maybeSingle();
    if (error) return serverError(res, error, 'An error occurred.', 400);
    return res.json({ intake: data ?? null });
  } catch (err) {
    return serverError(res, err, 'Failed to load triage intake.', 400);
  }
});

// Generates (and caches) a short LLM summary for the home screen health status banner.
// Cache is invalidated automatically when triage completes (writeTriageIntake).
// Edit the prompt below to change the wording/style shown on the home screen.
router.get('/home-summary', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `home-summary:${userId}`;

    const hit = cache.get(cacheKey);
    if (hit !== undefined) return res.json({ summary: hit });

    const { data: intake, error } = await supabase
      .from('triage_intakes')
      .select('urgency, summary, answers')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return serverError(res, error, 'An error occurred.', 400);
    if (!intake) return res.json({ summary: null });

    const answerText = Array.isArray(intake.answers)
      ? intake.answers.map(({ q, a }) => `Q: ${q}\nA: ${a}`).join('\n\n')
      : '';

    // ── Edit this prompt to change the home screen health status text ──────────
    const prompt =
      `You are writing a 1–2 sentence health status blurb for a patient's app home screen.\n` +
      `Be direct and clinical. Write in second person ("you", "your").\n` +
      `Focus on the chief complaint and key symptom details — not demographics.\n` +
      `Do not mention the patient's name, age, or sex.\n` +
      `Do not repeat the urgency word (it is already shown as a separate label).\n` +
      `Do not use bullet points or em dashes. End with a period.\n\n` +
      `Urgency: ${intake.urgency}\n` +
      `Clinical summary:\n${intake.summary || '(none)'}\n\n` +
      `Triage answers:\n${answerText || '(none)'}`;
    // ──────────────────────────────────────────────────────────────────────────

    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      prompt,
      maxTokens: 80,
    });

    const summary = text.trim() || null;
    cache.set(cacheKey, summary, 24 * 60 * 60 * 1000);
    return res.json({ summary });
  } catch (err) {
    return serverError(res, err, 'Failed to generate home summary.');
  }
});

module.exports = router;
