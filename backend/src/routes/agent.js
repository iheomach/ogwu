const serverError = require('../lib/serverError');
const express = require('express');
const { google } = require('googleapis');
const { DateTime } = require('luxon');
const z = require('zod');
const { HumanMessage, AIMessage, ToolMessage } = require('@langchain/core/messages');

const router = express.Router();

const authenticate = require('../middleware/auth');
const supabase = require('../lib/supabase');
const { buildSystemPrompt } = require('../lib/buildSystemPrompt');
const { buildGraph } = require('../lib/buildGraph');
const { SKILL_NAMES } = require('../lib/buildToolNodes');
const { getCheckpointer } = require('../lib/checkpointer');
const { Command } = require('@langchain/langgraph');

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
  const v = String(u || '').toLowerCase();
  if (['emergency', 'urgent', 'routine', 'self_care'].includes(v)) return v;
  return 'routine';
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

// ── Route ────────────────────────────────────────────────────────────────────

router.post('/chat', authenticate, async (req, res) => {
  try {
    const [profile, triageIntake] = await Promise.all([
      loadPatientProfile(req.user.id),
      loadTriageIntake(req.user.id),
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

    const system = buildSystemPrompt({ ...profile, liveLocation, triageIntake });
    const checkpointer = await getCheckpointer();
    const agent = buildGraph(skillCtx, system, checkpointer);
    const langChainMessages = toLangChainMessages(messages);
    const threadConfig = { configurable: { thread_id: req.user.id } };

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
            writePart('0', content);
          } else if (Array.isArray(content)) {
            for (const part of content) {
              if (part.type === 'text' && part.text) {
                hasText = true;
                writePart('0', part.text);
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
        } else if (eventName === 'on_chain_start' && skillNameSet.has(name)) {
          // Tool node started — extract tool call info from the agent's last message
          const state = data?.input;
          const lastMsg = state?.messages?.[state.messages.length - 1];
          const toolCall = lastMsg?.tool_calls?.find((tc) => tc.name === name);
          if (toolCall) {
            pendingTools.set(run_id, { toolCallId: toolCall.id, toolName: name });
            console.log(`[agent] tool-call: ${name}`);
            writePart('9', { toolCallId: toolCall.id, toolName: name, args: toolCall.args ?? {} });
          }
        } else if (eventName === 'on_chain_end' && skillNameSet.has(name)) {
          // Tool node finished — emit result using the ToolMessage added to state
          const pending = pendingTools.get(run_id);
          if (pending) {
            const toolMessages = data?.output?.messages ?? [];
            const toolMsg = toolMessages.find((m) => m.tool_call_id === pending.toolCallId);
            if (toolMsg) {
              const raw = toolMsg.content;
              let result;
              try { result = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? ''); } catch { result = raw ?? ''; }
              console.log(`[agent] tool-result: ${JSON.stringify(result).slice(0, 200)}`);
              writePart('a', { toolCallId: pending.toolCallId, result });
            }
            pendingTools.delete(run_id);
          }
        }
      }
    } catch (streamErr) {
      console.error('[agent] stream caught:', streamErr?.message);
      writePart('3', String(streamErr?.message ?? 'Stream error'));
    }

    // Check if the graph paused for human-in-the-loop confirmation
    if (checkpointer) {
      const graphState = await agent.getState(threadConfig);
      const pendingInterrupts = (graphState.tasks ?? []).flatMap((t) => t.interrupts ?? []);
      if (pendingInterrupts.length > 0) {
        hasText = true; // suppress the fallback error message
        writePart('2', [{ type: 'booking_interrupt', data: pendingInterrupts[0].value }]);
      }
    }

    if (!hasText) {
      console.error(`[agent] no text emitted. steps=${stepCount} userId=${req.user?.id}`);
      writePart('0', "I'm sorry, something went wrong on my end. Please try sending your message again.");
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

    const [profile, triageIntake] = await Promise.all([
      loadPatientProfile(req.user.id),
      loadTriageIntake(req.user.id),
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

    const system = buildSystemPrompt({ ...profile, liveLocation, triageIntake });
    const agent = buildGraph(skillCtx, system, checkpointer);
    const threadConfig = { configurable: { thread_id: req.user.id } };

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
            writePart('0', content);
          } else if (Array.isArray(content)) {
            for (const part of content) {
              if (part.type === 'text' && part.text) { hasText = true; writePart('0', part.text); }
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
        } else if (eventName === 'on_chain_start' && skillNameSet.has(name)) {
          const state = data?.input;
          const lastMsg = state?.messages?.[state.messages.length - 1];
          const toolCall = lastMsg?.tool_calls?.find((tc) => tc.name === name);
          if (toolCall) {
            pendingTools.set(run_id, { toolCallId: toolCall.id, toolName: name });
            writePart('9', { toolCallId: toolCall.id, toolName: name, args: toolCall.args ?? {} });
          }
        } else if (eventName === 'on_chain_end' && skillNameSet.has(name)) {
          const pending = pendingTools.get(run_id);
          if (pending) {
            const toolMessages = data?.output?.messages ?? [];
            const toolMsg = toolMessages.find((m) => m.tool_call_id === pending.toolCallId);
            if (toolMsg) {
              const raw = toolMsg.content;
              let result;
              try { result = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? ''); } catch { result = raw ?? ''; }
              writePart('a', { toolCallId: pending.toolCallId, result });
            }
            pendingTools.delete(run_id);
          }
        }
      }
    } catch (streamErr) {
      console.error('[agent] resume stream caught:', streamErr?.message);
      writePart('3', String(streamErr?.message ?? 'Stream error'));
    }

    if (!hasText) writePart('0', confirmed
      ? "I'm sorry, something went wrong with the booking. Please try again."
      : 'Booking cancelled. Let me know if you\'d like to pick a different time.');

    writePart('d', { finishReason: 'stop', usage: totalUsage });
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(400).json({ error: err?.message || 'Failed to resume agent' });
    }
  }
});

module.exports = router;
