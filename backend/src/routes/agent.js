const serverError = require('../lib/serverError');
const express = require('express');
const { google } = require('googleapis');
const { DateTime } = require('luxon');
const z = require('zod');
const { HumanMessage, AIMessage, ToolMessage, SystemMessage } = require('@langchain/core/messages');
const { ChatOpenAI } = require('@langchain/openai');

const router = express.Router();

const authenticate = require('../middleware/auth');
const supabase = require('../lib/supabase');
const { buildSystemPrompt } = require('../lib/buildSystemPrompt');
const { buildGraph } = require('../lib/buildGraph');
const { SKILL_NAMES } = require('../lib/buildToolNodes');
const { getCheckpointer } = require('../lib/checkpointer');
const { Command } = require('@langchain/langgraph');
const { parseAgentUrgency } = require('../lib/urgency');
const { checkWithLlamaGuard, OUTPUT_SAFE_FALLBACK } = require('../lib/llamaGuard');

function safeText(s, maxLen) {
  const out = typeof s === 'string' ? s.trim() : '';
  if (!out) return '';
  return out.length > maxLen ? out.slice(0, maxLen) : out;
}

/** Great-circle distance in km (Haversine). */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeUrgency(u) {
  return parseAgentUrgency(String(u || '').toLowerCase());
}

function getOAuthClient() {
  const { GOOGLE_OAUTH_CLIENT_ID: id, GOOGLE_OAUTH_CLIENT_SECRET: secret, GOOGLE_OAUTH_REDIRECT_URI: uri } = process.env;
  if (!id || !secret || !uri) return null;
  return new google.auth.OAuth2(id, secret, uri);
}

async function getClinicCalendarAuth() {
  const { data, error } = await supabase
    .from('integration_tokens')
    .select('refresh_token, access_token, expiry, meta')
    .eq('provider', 'google_calendar')
    .maybeSingle();

  if (error || !data?.refresh_token) return null;
  const oauth2Client = getOAuthClient();
  if (!oauth2Client) return null;

  oauth2Client.setCredentials({
    refresh_token: data.refresh_token,
    access_token: data.access_token || undefined,
    expiry_date: data.expiry ? new Date(data.expiry).getTime() : undefined,
  });

  const calendarId = data?.meta?.calendar_id || process.env.GOOGLE_CLINIC_CALENDAR_ID || 'primary';
  return { oauth2Client, calendarId };
}

// Module-level cache so the calendar timezone is fetched once per process lifetime.
let _cachedCalendarTimeZone = null;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)),
  ]);
}

// patientTimeZone: IANA zone from the patient's device — slots are displayed in this zone
// providerTimeZone: overrides the calendar's own zone for working-hours logic (optional)
async function fetchAvailableSlots(daysAhead = 5, patientTimeZone = null, providerTimeZone = null) {
  const auth = await getClinicCalendarAuth();
  if (!auth) return [];

  const { oauth2Client, calendarId } = auth;
  const cal = google.calendar({ version: 'v3', auth: oauth2Client });

  // Resolve the clinic/provider timezone for working-hours calculation.
  // Prefer caller-supplied, then cached from a previous call, then fetch once and cache.
  if (!providerTimeZone) {
    if (_cachedCalendarTimeZone) {
      providerTimeZone = _cachedCalendarTimeZone;
    } else {
      try {
        const calMeta = await withTimeout(cal.calendars.get({ calendarId }), 5000);
        providerTimeZone = calMeta.data.timeZone || 'UTC';
        _cachedCalendarTimeZone = providerTimeZone;
      } catch {
        providerTimeZone = 'UTC';
      }
    }
  }

  // Patient display zone — fall back to provider zone if unknown
  const displayZone = patientTimeZone || providerTimeZone;

  // Working-hours window is always in the provider's timezone (8am–5pm clinic time)
  const now = DateTime.now().setZone(providerTimeZone);
  const rangeEnd = now.plus({ days: daysAhead + 1 }).startOf('day');

  let busyTimes = [];
  try {
    const fb = await withTimeout(
      cal.freebusy.query({
        requestBody: { timeMin: now.toISO(), timeMax: rangeEnd.toISO(), items: [{ id: calendarId }] },
      }),
      8000
    );
    busyTimes = fb?.data?.calendars?.[calendarId]?.busy || [];
  } catch { busyTimes = []; }

  const slots = [];
  let cursor = now.plus({ hours: 1 }).startOf('hour');

  while (cursor < rangeEnd && slots.length < 60) {
    const weekday = cursor.weekday;
    const hour = cursor.hour;

    if (weekday >= 1 && weekday <= 5 && hour >= 8 && hour < 17) {
      const slotEnd = cursor.plus({ minutes: 30 });
      const busy = busyTimes.some((b) => {
        const bStart = DateTime.fromISO(b.start);
        const bEnd = DateTime.fromISO(b.end);
        return cursor < bEnd && slotEnd > bStart;
      });
      if (!busy) {
        // Convert the slot to the patient's local timezone for display
        const inPatientZone = cursor.setZone(displayZone);
        slots.push({
          starts_at_local: inPatientZone.toFormat("yyyy-MM-dd'T'HH:mm"),
          display: inPatientZone.toFormat("ccc d MMM, h:mm a"),
          time_zone: displayZone,           // patient's timezone — used by bookAppointment to parse starts_at_local
          provider_time_zone: providerTimeZone, // clinic's timezone — used for the calendar event
        });
      }
    }

    cursor = cursor.plus({ minutes: 30 });
    if (cursor.hour >= 17) cursor = cursor.plus({ days: 1 }).startOf('day').set({ hour: 8 });
    if (cursor.weekday > 5) cursor = cursor.set({ weekday: 1 }).plus(cursor.weekday === 6 ? { days: 2 } : { days: 1 });
  }

  return slots;
}

async function loadPatientProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, phone, dob, biological_sex, allergies, known_conditions, first_name, last_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || { id: userId };
}

async function loadTriageIntake(userId) {
  const { data } = await supabase
    .from('triage_intakes')
    .select('answers, urgency, summary, safety_note, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  return data || null;
}

async function loadLastHospital(userId) {
  const { data: appt } = await supabase
    .from('appointments')
    .select('hospital_id')
    .eq('patient_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!appt?.hospital_id) return null;

  const { data: hospital } = await supabase
    .from('hospitals_directory')
    .select('id, name, is_onboarded')
    .eq('id', appt.hospital_id)
    .maybeSingle();

  return hospital || null;
}

// ── Message conversion ────────────────────────────────────────────────────────

function getToolInvocations(msg) {
  // v5 parts format: parts[].type === 'tool-invocation' with state === 'result'
  if (Array.isArray(msg.parts)) {
    const fromParts = msg.parts
      .filter((p) => p.type === 'tool-invocation' && p.toolInvocation?.state === 'result')
      .map((p) => p.toolInvocation);
    if (fromParts.length > 0) return fromParts;
  }
  // legacy toolInvocations array
  if (Array.isArray(msg.toolInvocations)) {
    return msg.toolInvocations.filter((i) => i.state === 'result');
  }
  return [];
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((p) => p.type === 'text').map((p) => p.text || '').join('');
  return '';
}

function toLangChainMessages(uiMessages) {
  const result = [];
  for (const msg of uiMessages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'user') {
      const text = extractText(msg.content);
      if (text.trim()) result.push(new HumanMessage(text));
      continue;
    }

    if (msg.role === 'assistant') {
      const text = extractText(msg.content);
      const invocations = getToolInvocations(msg);

      if (invocations.length > 0) {
        result.push(new AIMessage({
          content: text || '',
          tool_calls: invocations.map((inv) => ({ id: inv.toolCallId, name: inv.toolName, args: inv.args || {} })),
        }));
        for (const inv of invocations) {
          const r = typeof inv.result === 'string' ? inv.result : JSON.stringify(inv.result ?? '');
          result.push(new ToolMessage({ content: r, tool_call_id: inv.toolCallId }));
        }
      } else if (text.trim()) {
        result.push(new AIMessage(text));
      }
      continue;
    }

    // CoreMessage format: role === 'tool'
    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'tool-result') {
          const r = typeof part.result === 'string' ? part.result : JSON.stringify(part.result ?? '');
          result.push(new ToolMessage({ content: r, tool_call_id: part.toolCallId }));
        }
      }
    }
  }
  return result;
}

// ── Session summary ───────────────────────────────────────────────────────────

async function summarizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const lines = [];
  for (const m of messages.slice(-10)) {
    const type = typeof m._getType === 'function' ? m._getType() : null;
    const raw = m.content;
    const content = typeof raw === 'string' ? raw.trim()
      : Array.isArray(raw) ? raw.filter((p) => p.type === 'text').map((p) => p.text || '').join('').trim()
      : '';
    if (!content || !type) continue;
    if (type === 'human') lines.push(`User: ${content.slice(0, 400)}`);
    else if (type === 'ai') lines.push(`Assistant: ${content.slice(0, 400)}`);
  }

  if (lines.length === 0) return null;

  const llm = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0, maxTokens: 120 });
  const result = await llm.invoke([
    new SystemMessage('Summarize where this health assistant conversation left off, addressing the patient directly in second person (use "you", not "the user"). In 1–4 sentences, state what you were trying to accomplish and what step you stopped at. Fewer sentences is better when the situation is clear. Be direct and natural.'),
    new HumanMessage(lines.join('\n')),
  ]);

  return typeof result.content === 'string' ? result.content.trim() : null;
}

router.get('/session', authenticate, async (req, res) => {
  try {
    const checkpointer = await getCheckpointer();
    if (!checkpointer) return res.json({ messages: [] });

    const { data: row } = await supabase
      .from('checkpoints')
      .select('thread_id')
      .like('thread_id', `${req.user.id}-%`)
      .order('thread_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row?.thread_id) return res.json({ messages: [] });

    const profile = await loadPatientProfile(req.user.id);
    const skillCtx = {
      z, supabase, profile,
      patientLat: null, patientLon: null, haversineKm,
      fetchAvailableSlots, getClinicCalendarAuth,
      safeText, normalizeUrgency, patientTimeZone: null,
    };

    const agent = buildGraph(skillCtx, '', checkpointer);
    const state = await agent.getState({ configurable: { thread_id: row.thread_id } });
    const langChainMsgs = state?.values?.messages ?? [];

    // Convert LangChain messages → AgentMessage[] for the frontend.
    // ToolMessages are folded into the preceding AIMessage as tool-result parts.
    const messages = [];
    let i = 0;
    while (i < langChainMsgs.length) {
      const m = langChainMsgs[i];
      const type = typeof m._getType === 'function' ? m._getType() : null;

      const extractText = (raw) =>
        typeof raw === 'string' ? raw.trim()
          : Array.isArray(raw) ? raw.filter((p) => p?.type === 'text').map((p) => p.text || '').join('').trim()
          : '';

      if (type === 'human') {
        messages.push({ id: `u-${i}`, role: 'user', content: extractText(m.content), parts: [] });
        i++;
      } else if (type === 'ai') {
        const toolCalls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
        const parts = toolCalls.map((tc) => ({
          type: 'tool-call', toolCallId: tc.id, toolName: tc.name,
          args: tc.args ?? {}, state: 'input-available',
        }));

        // Consume all immediately following ToolMessages
        let j = i + 1;
        while (j < langChainMsgs.length) {
          const next = langChainMsgs[j];
          const nextType = typeof next._getType === 'function' ? next._getType() : null;
          if (nextType !== 'tool') break;
          let result;
          try { result = typeof next.content === 'string' ? JSON.parse(next.content) : next.content; } catch { result = next.content; }
          const idx = parts.findIndex((p) => p.toolCallId === next.tool_call_id);
          if (idx !== -1) {
            parts[idx] = { ...parts[idx], type: 'tool-result', result, output: result, state: 'output-available' };
          }
          j++;
        }

        messages.push({ id: `a-${i}`, role: 'assistant', content: extractText(m.content), parts });
        i = j;
      } else {
        i++;
      }
    }

    res.json({ messages });
  } catch (err) {
    console.error('[agent] session load error:', err?.message);
    res.json({ messages: [] });
  }
});

router.get('/context', authenticate, async (req, res) => {
  try {
    const checkpointer = await getCheckpointer();
    if (!checkpointer) return res.json({ summary: null });

    // Find the most recent session thread for this user.
    // thread_id format: `${userId}-${Date.now()}` — timestamp suffix sorts lexicographically.
    const { data: row } = await supabase
      .from('checkpoints')
      .select('thread_id')
      .like('thread_id', `${req.user.id}-%`)
      .order('thread_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row?.thread_id) return res.json({ summary: null });

    const profile = await loadPatientProfile(req.user.id);
    const skillCtx = {
      z, supabase, profile,
      patientLat: null, patientLon: null, haversineKm,
      fetchAvailableSlots, getClinicCalendarAuth,
      safeText, normalizeUrgency,
      patientTimeZone: null,
    };

    const agent = buildGraph(skillCtx, '', checkpointer);
    const state = await agent.getState({ configurable: { thread_id: row.thread_id } });
    const msgs = state?.values?.messages ?? [];

    const summary = await summarizeMessages(msgs);
    res.json({ summary });
  } catch (err) {
    console.error('[agent] context summary error:', err?.message);
    res.json({ summary: null });
  }
});

router.get('/session', authenticate, async (req, res) => {
  try {
    const checkpointer = await getCheckpointer();
    if (!checkpointer) return res.json({ messages: [] });

    const { data: row } = await supabase
      .from('checkpoints')
      .select('thread_id')
      .like('thread_id', `${req.user.id}-%`)
      .order('thread_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row?.thread_id) return res.json({ messages: [] });

    const profile = await loadPatientProfile(req.user.id);
    const skillCtx = {
      z, supabase, profile,
      patientLat: null, patientLon: null, haversineKm,
      fetchAvailableSlots, getClinicCalendarAuth,
      safeText, normalizeUrgency,
      patientTimeZone: null,
    };

    const agent = buildGraph(skillCtx, '', checkpointer);
    const state = await agent.getState({ configurable: { thread_id: row.thread_id } });
    const msgs = state?.values?.messages ?? [];

    const messages = msgs
      .filter((m) => {
        const type = typeof m._getType === 'function' ? m._getType() : null;
        return type === 'human' || type === 'ai';
      })
      .map((m, i) => {
        const type = typeof m._getType === 'function' ? m._getType() : null;
        const raw = m.content;
        const content = typeof raw === 'string' ? raw
          : Array.isArray(raw) ? raw.filter((p) => p.type === 'text').map((p) => p.text || '').join('')
          : '';
        return {
          id: m.id || `msg-${i}`,
          role: type === 'human' ? 'user' : 'assistant',
          content,
          parts: [],
        };
      });

    res.json({ messages });
  } catch (err) {
    console.error('[agent] session load error:', err?.message);
    res.json({ messages: [] });
  }
});

// ── Route ────────────────────────────────────────────────────────────────────

router.post('/chat', authenticate, async (req, res) => {
  try {
    const [profile, triageIntake, lastHospital] = await Promise.all([
      loadPatientProfile(req.user.id),
      loadTriageIntake(req.user.id),
      loadLastHospital(req.user.id),
    ]);

    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const liveLocation = safeText(req.body?.location, 100) || null;
    const patientLat = typeof req.body?.lat === 'number' ? req.body.lat : null;
    const patientLon = typeof req.body?.lon === 'number' ? req.body.lon : null;
    const patientTimeZone = safeText(req.body?.time_zone, 100) || null;

    const skillCtx = {
      z, supabase, profile,
      patientLat, patientLon, haversineKm,
      fetchAvailableSlots, getClinicCalendarAuth,
      safeText, normalizeUrgency,
      patientTimeZone,
    };

    const system = buildSystemPrompt({ ...profile, liveLocation, triageIntake, lastHospital });
    const checkpointer = await getCheckpointer();
    const agent = buildGraph(skillCtx, system, checkpointer);
    const langChainMessages = toLangChainMessages(messages);
    const sessionId = safeText(req.body?.session_id, 64) || 'default';
    const threadConfig = { configurable: { thread_id: `${req.user.id}-${sessionId}` } };

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Vercel-AI-Data-Stream', 'v1');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    function writePart(code, value) {
      res.write(`${code}:${JSON.stringify(value)}\n`);
    }

    let hasText = false;
    let stepCount = 0;
    const totalUsage = { promptTokens: 0, completionTokens: 0 };
    // run_id → { toolCallId, toolName } — matched across on_chain_start/end for tool nodes
    const pendingTools = new Map();
    const skillNameSet = new Set(SKILL_NAMES);
    // Buffer text chunks — moderated before sending to the patient
    const textChunks = [];

    try {
      const eventStream = agent.streamEvents(
        { messages: langChainMessages },
        { version: 'v2', recursionLimit: 40, ...threadConfig },
      );

      for await (const event of eventStream) {
        const { event: eventName, name, run_id, data } = event;

        if (eventName === 'on_chat_model_stream') {
          const content = data?.chunk?.content;
          if (typeof content === 'string' && content) {
            hasText = true;
            textChunks.push(content);
          } else if (Array.isArray(content)) {
            for (const part of content) {
              if (part.type === 'text' && part.text) {
                hasText = true;
                textChunks.push(part.text);
              }
            }
          }
        } else if (eventName === 'on_chat_model_start') {
          stepCount++;
          writePart('f', { messageId: `step-${Date.now()}` });
        } else if (eventName === 'on_chat_model_end') {
          const usage = data?.output?.response_metadata?.token_usage;
          const promptTokens = usage?.prompt_tokens ?? 0;
          const completionTokens = usage?.completion_tokens ?? 0;
          totalUsage.promptTokens += promptTokens;
          totalUsage.completionTokens += completionTokens;
          writePart('e', {
            finishReason: data?.output?.response_metadata?.finish_reason ?? 'stop',
            usage: { promptTokens, completionTokens },
            isContinued: false,
          });
        } else if (eventName === 'on_chain_start' && name === 'tools') {
          // Unified dispatcher started — register all tool calls from the agent's last message
          const state = data?.input;
          const lastMsg = state?.messages?.[state.messages.length - 1];
          const toolCalls = lastMsg?.tool_calls ?? [];
          const pending = [];
          for (const tc of toolCalls) {
            if (skillNameSet.has(tc.name)) {
              pending.push({ toolCallId: tc.id, toolName: tc.name });
              console.log(`[agent] tool-call: ${tc.name}`);
              writePart('9', { toolCallId: tc.id, toolName: tc.name, args: tc.args ?? {} });
            }
          }
          if (pending.length > 0) pendingTools.set(run_id, pending);
        } else if (eventName === 'on_chain_end' && name === 'tools') {
          // Dispatcher finished — emit results for all tool calls that completed
          const pending = pendingTools.get(run_id);
          if (pending) {
            const toolMessages = data?.output?.messages ?? [];
            for (const p of pending) {
              const toolMsg = toolMessages.find((m) => m.tool_call_id === p.toolCallId);
              if (toolMsg) {
                const raw = toolMsg.content;
                let result;
                try { result = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? ''); } catch { result = raw ?? ''; }
                console.log(`[agent] tool-result: ${JSON.stringify(result).slice(0, 200)}`);
                writePart('a', { toolCallId: p.toolCallId, result });
              }
            }
            pendingTools.delete(run_id);
          }
        }
      }
    } catch (streamErr) {
      console.error('[agent] stream caught:', streamErr?.message);
      writePart('3', String(streamErr?.message ?? 'Stream error'));
    }

    // Single getState call covers: booking interrupt + input_blocked check
    if (checkpointer) {
      const graphState = await agent.getState(threadConfig);

      const pendingInterrupts = (graphState.tasks ?? []).flatMap((t) => t.interrupts ?? []);
      if (pendingInterrupts.length > 0) {
        hasText = true;
        writePart('2', [{ type: 'booking_interrupt', data: pendingInterrupts[0].value }]);
      }

      if (!hasText && graphState.values?.input_blocked) {
        const lastMsg = graphState.values.messages[graphState.values.messages.length - 1];
        const raw = lastMsg?.content;
        const blocked = typeof raw === 'string' ? raw
          : Array.isArray(raw) ? raw.filter((p) => p.type === 'text').map((p) => p.text).join('') : OUTPUT_SAFE_FALLBACK;
        writePart('0', blocked);
        hasText = true;
      }
    }

    if (!hasText) {
      console.error(`[agent] no text emitted. steps=${stepCount} userId=${req.user?.id}`);
      writePart('0', "I'm sorry, something went wrong on my end. Please try sending your message again.");
    } else if (textChunks.length > 0) {
      // Run Llama Guard on the agent's response before sending it to the patient
      const lastUserMsg = messages.filter((m) => m.role === 'user').pop();
      const lastUserText = extractText(lastUserMsg?.content ?? '');
      const turns = lastUserText
        ? [{ role: 'user', content: lastUserText }, { role: 'assistant', content: textChunks.join('') }]
        : [{ role: 'assistant', content: textChunks.join('') }];

      const guardResult = await checkWithLlamaGuard(turns, 'Agent');
      if (!guardResult.safe) {
        console.warn(`[agent] output blocked for user=${req.user?.id} category=${guardResult.category}`);
        writePart('0', OUTPUT_SAFE_FALLBACK);
      } else {
        for (const chunk of textChunks) writePart('0', chunk);
      }
    }

    writePart('d', {
      finishReason: 'stop',
      usage: totalUsage,
    });

    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(400).json({ error: err?.message || 'Failed to run agent' });
    }
  }
});

// ── Resume endpoint (human-in-the-loop) ──────────────────────────────────────

router.post('/resume', authenticate, async (req, res) => {
  try {
    const confirmed = req.body?.confirmed === true;
    const checkpointer = await getCheckpointer();
    if (!checkpointer) return res.status(400).json({ error: 'Checkpointer not configured' });

    const [profile, triageIntake, lastHospital] = await Promise.all([
      loadPatientProfile(req.user.id),
      loadTriageIntake(req.user.id),
      loadLastHospital(req.user.id),
    ]);

    const liveLocation = safeText(req.body?.location, 100) || null;
    const patientLat = typeof req.body?.lat === 'number' ? req.body.lat : null;
    const patientLon = typeof req.body?.lon === 'number' ? req.body.lon : null;
    const patientTimeZone = safeText(req.body?.time_zone, 100) || null;

    const skillCtx = {
      z, supabase, profile,
      patientLat, patientLon, haversineKm,
      fetchAvailableSlots, getClinicCalendarAuth,
      safeText, normalizeUrgency,
      patientTimeZone,
    };

    const system = buildSystemPrompt({ ...profile, liveLocation, triageIntake, lastHospital });
    const agent = buildGraph(skillCtx, system, checkpointer);
    const sessionId = safeText(req.body?.session_id, 64) || 'default';
    const threadConfig = { configurable: { thread_id: `${req.user.id}-${sessionId}` } };

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Vercel-AI-Data-Stream', 'v1');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    function writePart(code, value) {
      res.write(`${code}:${JSON.stringify(value)}\n`);
    }

    let hasText = false;
    const totalUsage = { promptTokens: 0, completionTokens: 0 };
    const pendingTools = new Map();
    const skillNameSet = new Set(SKILL_NAMES);
    const textChunks = [];

    try {
      const eventStream = agent.streamEvents(
        new Command({ resume: confirmed }),
        { version: 'v2', recursionLimit: 40, ...threadConfig },
      );

      for await (const event of eventStream) {
        const { event: eventName, name, run_id, data } = event;

        if (eventName === 'on_chat_model_stream') {
          const content = data?.chunk?.content;
          if (typeof content === 'string' && content) {
            hasText = true;
            textChunks.push(content);
          } else if (Array.isArray(content)) {
            for (const part of content) {
              if (part.type === 'text' && part.text) { hasText = true; textChunks.push(part.text); }
            }
          }
        } else if (eventName === 'on_chat_model_start') {
          writePart('f', { messageId: `step-${Date.now()}` });
        } else if (eventName === 'on_chat_model_end') {
          const usage = data?.output?.response_metadata?.token_usage;
          totalUsage.promptTokens += usage?.prompt_tokens ?? 0;
          totalUsage.completionTokens += usage?.completion_tokens ?? 0;
          writePart('e', {
            finishReason: data?.output?.response_metadata?.finish_reason ?? 'stop',
            usage: { promptTokens: usage?.prompt_tokens ?? 0, completionTokens: usage?.completion_tokens ?? 0 },
            isContinued: false,
          });
        } else if (eventName === 'on_chain_start' && name === 'tools') {
          const state = data?.input;
          const lastMsg = state?.messages?.[state.messages.length - 1];
          const toolCalls = lastMsg?.tool_calls ?? [];
          const pending = [];
          for (const tc of toolCalls) {
            if (skillNameSet.has(tc.name)) {
              pending.push({ toolCallId: tc.id, toolName: tc.name });
              writePart('9', { toolCallId: tc.id, toolName: tc.name, args: tc.args ?? {} });
            }
          }
          if (pending.length > 0) pendingTools.set(run_id, pending);
        } else if (eventName === 'on_chain_end' && name === 'tools') {
          const pending = pendingTools.get(run_id);
          if (pending) {
            const toolMessages = data?.output?.messages ?? [];
            for (const p of pending) {
              const toolMsg = toolMessages.find((m) => m.tool_call_id === p.toolCallId);
              if (toolMsg) {
                const raw = toolMsg.content;
                let result;
                try { result = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? ''); } catch { result = raw ?? ''; }
                writePart('a', { toolCallId: p.toolCallId, result });
              }
            }
            pendingTools.delete(run_id);
          }
        }
      }
    } catch (streamErr) {
      console.error('[agent] resume stream caught:', streamErr?.message);
      writePart('3', String(streamErr?.message ?? 'Stream error'));
    }

    if (!hasText) {
      writePart('0', confirmed
        ? "I'm sorry, something went wrong with the booking. Please try again."
        : 'Booking cancelled. Let me know if you\'d like to pick a different time.');
    } else if (textChunks.length > 0) {
      const guardResult = await checkWithLlamaGuard(
        [{ role: 'assistant', content: textChunks.join('') }],
        'Agent',
      );
      if (!guardResult.safe) {
        console.warn(`[agent] resume output blocked for user=${req.user?.id} category=${guardResult.category}`);
        writePart('0', OUTPUT_SAFE_FALLBACK);
      } else {
        for (const chunk of textChunks) writePart('0', chunk);
      }
    }

    writePart('d', { finishReason: 'stop', usage: totalUsage });
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(400).json({ error: err?.message || 'Failed to resume agent' });
    }
  }
});

// ── Clear checkpoint history ──────────────────────────────────────────────────

router.delete('/history', authenticate, async (req, res) => {
  try {
    const prefix = `${req.user.id}-%`;
    await Promise.all([
      supabase.from('checkpoints').delete().like('thread_id', prefix),
      supabase.from('checkpoint_writes').delete().like('thread_id', prefix),
      supabase.from('checkpoint_blobs').delete().like('thread_id', prefix),
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to clear history' });
  }
});

module.exports = router;
