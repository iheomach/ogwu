'use strict';

/**
 * LangGraph-based triage interview.
 *
 * Two compiled graphs, both stateless (full state passed on every call):
 *
 *   nextGraph     — /api/triage/next
 *                   START → check_done → (done) END
 *                                      → ask_question → END
 *
 *   completeGraph — /api/triage/complete
 *                   START → extract_entities → compute_urgency → summarize → write → END
 *
 * Public API: runTriageNext(params), runTriageComplete(params)
 */

const { StateGraph, Annotation, END } = require('@langchain/langgraph');
const comprehendMedical = require('./comprehendMedical');
const { parseTriageUrgency } = require('./urgency');
const healthlake = require('./healthlake');
const supabase = require('./supabase');

const fetchImpl = global.fetch || require('node-fetch');

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_ANSWERS_BEFORE_DONE = 5; // LLM may not signal done before this many answers
const LANGUAGE_NAMES = { en: 'English', es: 'Spanish', fr: 'French', ig: 'Igbo', yo: 'Yoruba', ha: 'Hausa' };

// ── State schema ──────────────────────────────────────────────────────────────

const TriageAnnotation = Annotation.Root({
  answers:            Annotation({ reducer: (_, v) => v ?? [],    default: () => [] }),
  suggestions:        Annotation({ reducer: (_, v) => v ?? [],    default: () => [] }),
  question_count:     Annotation({ reducer: (_, v) => v ?? 0,    default: () => 0 }),
  max_questions:      Annotation({ reducer: (_, v) => v,         default: () => parseInt(process.env.TRIAGE_MAX_QUESTIONS || '10', 10) }),
  locale:             Annotation({ reducer: (_, v) => v,         default: () => 'en' }),
  profile:            Annotation({ reducer: (_, v) => v,         default: () => ({}) }),
  location:           Annotation({ reducer: (_, v) => v,         default: () => null }),
  patient_id:         Annotation({ reducer: (_, v) => v,         default: () => null }),
  extracted_entities: Annotation({ reducer: (_, v) => v,         default: () => [] }),
  emergency_signaled: Annotation({ reducer: (_, v) => v,         default: () => false }),
  urgent_signaled:    Annotation({ reducer: (_, v) => v,         default: () => false }),
  urgency:            Annotation({ reducer: (_, v) => v,         default: () => null }),
  summary:            Annotation({ reducer: (_, v) => v,         default: () => null }),
  safety_note:        Annotation({ reducer: (_, v) => v,         default: () => null }),
  done:               Annotation({ reducer: (_, v) => v,         default: () => false }),
  next_question:      Annotation({ reducer: (_, v) => v,         default: () => null }),
  intake:             Annotation({ reducer: (_, v) => v,         default: () => null }),
});

// ── Shared utilities ──────────────────────────────────────────────────────────

// Keyword fallbacks used when Comprehend Medical returns no high-confidence entities
// (e.g. very short answers, vague input). Comprehend + EMERGENCY_PREFIXES is the
// primary signal; these only fire when that path produces nothing.
const EMERGENCY_KEYWORD_FALLBACKS = [
  'chest pain', 'pressure in chest', 'trouble breathing', 'cant breathe', "can't breathe",
  'shortness of breath', 'severe bleeding', 'bleeding a lot', 'passed out', 'fainted',
  'confusion', 'slurred speech', 'weakness on one side', 'seizure', 'suicidal',
  'kill myself', 'overdose',
];

const URGENT_KEYWORD_FALLBACKS = [
  'blood in urine', 'blood in stool', 'vomiting blood', 'throwing up blood', 'black stool',
  'severe pain', 'worst pain', 'severe headache', 'stiff neck',
  'high fever', 'fever 39', 'fever 40', 'temperature 39', 'temperature 40',
];

const SOON_KEYWORD_FALLBACKS = [
  'fever', 'chills', 'dizzy', 'dizziness', 'dehydr', 'worse', 'getting worse',
];

function normalizeText(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s+/-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasEmergencyKeywordFallback(text) {
  const t = normalizeText(text);
  return EMERGENCY_KEYWORD_FALLBACKS.some((kw) => t.includes(kw));
}

function computeUrgencyFromState(state) {
  // Scan answers only — questions often contain emergency keywords (e.g. "any confusion?")
  // that would falsely fire if question text were included.
  const text = (state.answers || []).map((x) => x?.a || '').join(' ');
  if (hasEmergencyKeywordFallback(text) || state.emergency_signaled) return 'emergency';
  const t = normalizeText(text);
  if (URGENT_KEYWORD_FALLBACKS.some((kw) => t.includes(kw)) || state.urgent_signaled) return 'urgent';
  if (/\b(9|10)\s*\/\s*10\b/.test(t)) return 'urgent';
  if (SOON_KEYWORD_FALLBACKS.some((kw) => t.includes(kw))) return 'soon';
  if (/\b(6|7|8)\s*\/\s*10\b/.test(t)) return 'soon';
  return 'routine';
}

function toUserDirectedSafetyNote(localeSafe, note) {
  const raw = typeof note === 'string' ? note.trim() : '';
  if (!raw) return null;
  if (localeSafe !== 'en') return raw;
  return raw
    .replace(/^\s*the patient should\b/i, 'You should')
    .replace(/^\s*patient should\b/i, 'You should')
    .replace(/\bthe patient\b/gi, 'you')
    .replace(/\bpatient\b/gi, 'you')
    .replace(/\btheir\b/gi, 'your')
    .replace(/^you\b/, 'You');
}

async function openaiJsonCall(messages) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.4,
      messages,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const { choices } = await res.json();
  return JSON.parse(choices?.[0]?.message?.content ?? '{}');
}

// ── Next graph nodes ──────────────────────────────────────────────────────────

function checkDoneNode(state) {
  if (state.question_count >= state.max_questions) return { done: true };
  return {};
}

function routeFromCheckDone(state) {
  return state.done ? END : 'ask_question';
}

async function askQuestionNode(state) {
  // Q1 and Q2 are always the same — skip LLM call entirely
  if (state.question_count === 0) {
    return {
      next_question: 'What is your main complaint or symptom today?',
      suggestions: ['Sore throat / throat pain', 'Headache or dizziness', 'Stomach pain or nausea', 'Chest pain or breathing'],
      done: false,
    };
  }
  if (state.question_count === 1) {
    return {
      next_question: 'On a scale of 0 to 10, how severe are your symptoms?',
      suggestions: [],
      done: false,
    };
  }

  const language = LANGUAGE_NAMES[state.locale] || 'English';
  const canSignalDone = state.question_count >= MIN_ANSWERS_BEFORE_DONE;
  const history = (state.answers || []).map(({ q, a }) => `Q: ${q}\nA: ${a}`).join('\n\n');

  const messages = [
    {
      role: 'system',
      content:
        `You are a clinical triage intake assistant. Ask ONE focused question to assess the patient.\n` +
        `Priority: onset/duration → severity (0–10) → red flag symptoms → location/spread → associated symptoms → medications tried.\n` +
        `Do NOT repeat any question already answered above.\n` +
        (canSignalDone
          ? `You may set "done": true if you have enough information to assess urgency.\n`
          : `Always set "done": false — not enough answers yet to conclude.\n`) +
        `Also provide 2–4 short suggested answers the patient could tap (each under 6 words, contextually grounded in the question and prior answers).\n` +
        `Never diagnose. Ask in ${language}.\n` +
        `Return ONLY JSON: { "question": string, "done": boolean, "suggestions": string[] }`,
    },
    {
      role: 'user',
      content: history ? `Answers so far:\n${history}` : 'No answers yet.',
    },
  ];

  try {
    const result = await openaiJsonCall(messages);
    const question = typeof result.question === 'string' ? result.question.trim() : null;
    const done = canSignalDone && result.done === true;
    const suggestions = Array.isArray(result.suggestions)
      ? result.suggestions.slice(0, 4).map((s) => String(s).trim()).filter(Boolean)
      : [];
    return { next_question: question, suggestions, done };
  } catch (err) {
    console.warn('[triageGraph] ask_question failed:', err.message);
    return { next_question: 'Please describe any other symptoms you are experiencing.', suggestions: [], done: false };
  }
}

// ── Complete graph nodes ──────────────────────────────────────────────────────

async function extractEntitiesNode(state) {
  const { entities = [], emergencySignaled = false, urgentSignaled = false } =
    await comprehendMedical.extractEntitiesFromAnswers(state.answers);
  return {
    extracted_entities: entities,
    emergency_signaled: emergencySignaled,
    urgent_signaled: urgentSignaled,
  };
}

function computeUrgencyNode(state) {
  return { urgency: parseTriageUrgency(computeUrgencyFromState(state)) };
}

async function summarizeNode(state) {
  const language = LANGUAGE_NAMES[state.locale] || 'English';
  const locationLine = state.location ? ` The patient is located in ${state.location}.` : '';

  let patientAge = null;
  if (state.profile?.dob) {
    const dob = new Date(state.profile.dob);
    if (!isNaN(dob.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      if (
        today.getMonth() < dob.getMonth() ||
        (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())
      ) age--;
      patientAge = age;
    }
  }
  const profileForLLM = { ...state.profile, ...(patientAge !== null ? { age: patientAge } : {}) };
  delete profileForLLM.dob;

  const messages = [
    {
      role: 'system',
      content:
        `Summarize the following patient intake in 4–6 bullets.${locationLine} ` +
        `No diagnosis, no treatment advice. ` +
        `If emergency symptoms are present, include a first bullet saying they should seek urgent care. ` +
        `Return ONLY JSON: { "summary": string, "safety_note": string|null }. ` +
        `Write in ${language}. ` +
        `Address the patient in second person ("you") in safety_note. ` +
        `Never use em dashes (—) — use a comma instead.`,
    },
    {
      role: 'user',
      content: JSON.stringify({
        locale: state.locale,
        profile: profileForLLM,
        location: state.location || undefined,
        answers: state.answers,
      }),
    },
  ];

  try {
    const result = await openaiJsonCall(messages);
    return {
      summary: typeof result.summary === 'string' ? result.summary : null,
      safety_note: toUserDirectedSafetyNote(state.locale, result.safety_note),
    };
  } catch (err) {
    console.warn('[triageGraph] summarize failed:', err.message);
    return { summary: null, safety_note: null };
  }
}

async function writeNode(state) {
  const {
    patient_id: patientId, locale, answers, urgency, summary, safety_note,
    extracted_entities: entities, profile = {},
  } = state;
  const ts = new Date().toISOString();

  console.log(`[triageGraph] write patient=${patientId} healthlake=${healthlake.isConfigured()} urgency=${urgency} entities=${entities.length}`);

  let intake;

  if (healthlake.isConfigured()) {
    await healthlake.writeTriageIntake(patientId, {
      locale, answers, urgency, summary, safety_note, extracted_entities: entities,
    });

    // Secondary FHIR writes: fire-and-forget.
    Promise.allSettled([
      healthlake.upsertPatient({ id: patientId, ...profile }),
      healthlake.writeConditions(patientId, profile.known_conditions, ts.slice(0, 10)),
      healthlake.writeAllergies(patientId, profile.allergies),
      healthlake.writeMedications(patientId, profile.current_medications),
    ]).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length) {
        console.warn('[healthlake] secondary writes failed:', failed.map((r) => r.reason?.message));
      }
    });

    intake = { user_id: patientId, locale, answers, urgency, summary, safety_note, created_at: ts, updated_at: ts };
  } else {
    const { data, error } = await supabase
      .from('triage_intakes')
      .upsert(
        { user_id: patientId, locale, answers, urgency, summary, safety_note },
        { onConflict: 'user_id' },
      )
      .select('user_id, locale, answers, urgency, summary, safety_note, created_at, updated_at')
      .single();
    if (error) throw error;
    intake = data;
  }

  return { intake };
}

// ── Graph factories ───────────────────────────────────────────────────────────

let _nextGraph = null;
let _completeGraph = null;

function getNextGraph() {
  if (_nextGraph) return _nextGraph;
  const graph = new StateGraph(TriageAnnotation)
    .addNode('check_done', checkDoneNode)
    .addNode('ask_question', askQuestionNode);

  graph.addEdge('__start__', 'check_done');
  graph.addConditionalEdges('check_done', routeFromCheckDone, [END, 'ask_question']);
  graph.addEdge('ask_question', END);

  _nextGraph = graph.compile();
  return _nextGraph;
}

function getCompleteGraph() {
  if (_completeGraph) return _completeGraph;
  const graph = new StateGraph(TriageAnnotation)
    .addNode('extract_entities', extractEntitiesNode)
    .addNode('compute_urgency', computeUrgencyNode)
    .addNode('summarize', summarizeNode)
    .addNode('write', writeNode);

  graph.addEdge('__start__', 'extract_entities');
  graph.addEdge('extract_entities', 'compute_urgency');
  graph.addEdge('compute_urgency', 'summarize');
  graph.addEdge('summarize', 'write');
  graph.addEdge('write', END);

  _completeGraph = graph.compile();
  return _completeGraph;
}

// ── Public API ────────────────────────────────────────────────────────────────

async function runTriageNext({ locale, profile, answers }) {
  const state = await getNextGraph().invoke({
    answers,
    question_count: answers.length,
    max_questions: parseInt(process.env.TRIAGE_MAX_QUESTIONS || '10', 10),
    locale,
    profile,
  });
  return { done: state.done, question: state.done ? null : state.next_question, suggestions: state.suggestions ?? [] };
}

async function runTriageComplete({ locale, profile, answers, location, patientId }) {
  const state = await getCompleteGraph().invoke({
    answers,
    question_count: answers.length,
    locale,
    profile,
    location,
    patient_id: patientId,
  });
  return { intake: state.intake, safety_note: state.safety_note };
}

module.exports = { runTriageNext, runTriageComplete, TriageAnnotation };
