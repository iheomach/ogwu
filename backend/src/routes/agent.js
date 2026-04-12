const express = require('express');
const { google } = require('googleapis');
const { DateTime } = require('luxon');

const router = express.Router();

const authenticate = require('../middleware/auth');
const supabase = require('../lib/supabase');
const { buildSystemPrompt } = require('../lib/buildSystemPrompt');
const { loadSkills } = require('../lib/loadSkills');

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

async function fetchAvailableSlots(daysAhead = 5, timeZone = 'Africa/Lagos') {
  const auth = await getClinicCalendarAuth();
  if (!auth) return [];

  const { oauth2Client, calendarId } = auth;
  const cal = google.calendar({ version: 'v3', auth: oauth2Client });
  const now = DateTime.now().setZone(timeZone);
  const rangeEnd = now.plus({ days: daysAhead + 1 }).startOf('day');

  let busyTimes = [];
  try {
    const fb = await cal.freebusy.query({
      requestBody: { timeMin: now.toISO(), timeMax: rangeEnd.toISO(), items: [{ id: calendarId }] },
    });
    busyTimes = fb?.data?.calendars?.[calendarId]?.busy || [];
  } catch { busyTimes = []; }

  const slots = [];
  let cursor = now.plus({ hours: 1 }).startOf('hour');

  while (cursor < rangeEnd && slots.length < 12) {
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
        slots.push({
          starts_at_local: cursor.toFormat("yyyy-MM-dd'T'HH:mm"),
          display: cursor.toFormat("ccc d MMM, h:mm a"),
          time_zone: timeZone,
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
    const [{ streamText, tool, stepCountIs }, { openai }, { z }] = await Promise.all([
      import('ai'),
      import('@ai-sdk/openai'),
      import('zod'),
    ]);

    const skillCtx = {
      z, supabase, profile,
      patientLat, patientLon, haversineKm,
      fetchAvailableSlots, getClinicCalendarAuth,
      safeText, normalizeUrgency,
    };

    const tools = loadSkills(tool, skillCtx);
    const system = buildSystemPrompt({ ...profile, liveLocation, triageIntake });

    const result = streamText({
      model: openai(process.env.OPENAI_MODEL || 'gpt-4o-mini'),
      system,
      messages,
      stopWhen: stepCountIs(20),
      tools,
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Vercel-AI-Data-Stream', 'v1');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    function writePart(code, value) {
      res.write(`${code}:${JSON.stringify(value)}\n`);
    }

    let hasText = false;
    let finishPart = null;
    let stepCount = 0;

    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            hasText = true;
            writePart('0', part.text);
            break;
          case 'tool-input-start': writePart('b', { toolCallId: part.id, toolName: part.toolName }); break;
          case 'tool-input-delta': writePart('c', { toolCallId: part.id, argsTextDelta: part.delta }); break;
          case 'tool-call':
            console.log(`[agent] tool-call: ${part.toolName}`);
            writePart('9', { toolCallId: part.toolCallId, toolName: part.toolName, args: part.input });
            break;
          case 'tool-result':
            console.log(`[agent] tool-result: ${JSON.stringify(part.output).slice(0, 200)}`);
            writePart('a', { toolCallId: part.toolCallId, result: part.output });
            break;
          case 'start-step':
            stepCount++;
            writePart('f', { messageId: `step-${Date.now()}` });
            break;
          case 'finish-step':
            writePart('e', {
              finishReason: part.finishReason,
              usage: { promptTokens: part.usage?.promptTokens ?? 0, completionTokens: part.usage?.completionTokens ?? 0 },
              isContinued: false,
            });
            break;
          case 'finish':
            finishPart = part;
            break;
          case 'error':
            console.error(`[agent] stream error:`, part.error);
            writePart('3', String(part.error?.message ?? part.error ?? 'Unknown error'));
            break;
        }
      }
    } catch (streamErr) {
      console.error(`[agent] stream caught:`, streamErr?.message);
      writePart('3', String(streamErr?.message ?? 'Stream error'));
    }

    if (!hasText) {
      console.error(`[agent] no text emitted. finishReason=${finishPart?.finishReason} steps=${stepCount} userId=${req.user?.id}`);
      writePart('0', "I'm sorry, something went wrong on my end. Please try sending your message again.");
    }

    writePart('d', {
      finishReason: finishPart?.finishReason ?? 'stop',
      usage: {
        promptTokens: finishPart?.totalUsage?.promptTokens ?? 0,
        completionTokens: finishPart?.totalUsage?.completionTokens ?? 0,
      },
    });

    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(400).json({ error: err?.message || 'Failed to run agent' });
    }
  }
});

module.exports = router;
