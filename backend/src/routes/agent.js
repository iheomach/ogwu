const express = require('express');
const { google } = require('googleapis');
const { DateTime } = require('luxon');

const router = express.Router();

const authenticate = require('../middleware/auth');
const supabase = require('../lib/supabase');
const { buildSystemPrompt } = require('../lib/buildSystemPrompt');

function safeText(s, maxLen) {
  const out = typeof s === 'string' ? s.trim() : '';
  if (!out) return '';
  return out.length > maxLen ? out.slice(0, maxLen) : out;
}

/** Great-circle distance in km between two lat/lon pairs (Haversine formula). */
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

function normalizeUrgency(u) {
  const v = String(u || '').toLowerCase();
  if (v === 'emergency' || v === 'urgent' || v === 'routine' || v === 'self_care') return v;
  return 'routine';
}

function getOAuthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
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

// Returns available 30-min slots in business hours over the next N days.
async function fetchAvailableSlots(daysAhead = 5, timeZone = 'Africa/Lagos') {
  const auth = await getClinicCalendarAuth();
  if (!auth) return [];

  const { oauth2Client, calendarId } = auth;
  const cal = google.calendar({ version: 'v3', auth: oauth2Client });

  const now = DateTime.now().setZone(timeZone);
  const rangeEnd = now.plus({ days: daysAhead + 1 }).startOf('day');

  // Query busy times for the whole range.
  let busyTimes = [];
  try {
    const fb = await cal.freebusy.query({
      requestBody: {
        timeMin: now.toISO(),
        timeMax: rangeEnd.toISO(),
        items: [{ id: calendarId }],
      },
    });
    busyTimes = fb?.data?.calendars?.[calendarId]?.busy || [];
  } catch {
    busyTimes = [];
  }

  // Generate all 30-min slots in 08:00–17:00 on weekdays.
  const slots = [];
  let cursor = now.plus({ hours: 1 }).startOf('hour');

  while (cursor < rangeEnd && slots.length < 12) {
    const weekday = cursor.weekday; // 1=Mon … 7=Sun
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
    // Skip non-business hours quickly.
    if (cursor.hour >= 17) cursor = cursor.plus({ days: 1 }).startOf('day').set({ hour: 8 });
    if (cursor.weekday > 5) cursor = cursor.set({ weekday: 1 }).plus(cursor.weekday === 6 ? { days: 2 } : { days: 1 });
  }

  return slots;
}

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

    const searchHospitalsSchema = z.object({
      state: z.string().optional().describe('City or state the patient is in (used as fallback if GPS is unavailable), e.g. Lagos, Abuja, California'),
      specialty: z.string().optional().describe('Medical specialty hint, e.g. urology, general practice'),
      has_emergency: z.boolean().optional().describe('True if emergency capability is required'),
    });

    const getHospitalBookingInfoSchema = z.object({
      hospital_id: z.string().describe('UUID of the hospital from searchHospitals results'),
      hospital_name: z.string().describe('Name of the hospital for context'),
      hospital_phone: z.string().describe('Phone number of the hospital'),
      is_onboarded: z.boolean().describe('Whether the hospital is onboarded on Ogwu'),
      complaint: z.string().describe("Patient's chief complaint"),
      urgency: z.enum(['emergency', 'urgent', 'routine', 'self_care']),
      symptoms: z.array(z.string()).describe('List of reported symptoms'),
      recommended_specialty: z.string().optional(),
    });

    const bookAppointmentSchema = z.object({
      hospital_id: z.string().describe('UUID of the onboarded hospital'),
      starts_at_local: z.string().describe("Slot start from getHospitalBookingInfo, e.g. '2026-04-10T09:00'"),
      time_zone: z.string().describe('IANA timezone from the slot, e.g. Africa/Lagos'),
      reason: z.string().describe('Brief appointment reason'),
    });

    const createConsultSchema = z.object({
      complaint: z.string().describe("Chief complaint in the patient's own words"),
      urgency: z.enum(['emergency', 'urgent', 'routine', 'self_care']),
      symptoms: z.array(z.string()),
      recommended_specialty: z.string().optional(),
      care_pathway: z.string().describe('Clear next steps for the patient'),
      recommended_hospital_ids: z.array(z.string()).optional(),
      is_emergency_flagged: z.boolean().optional(),
    });

    const flagEmergencySchema = z.object({
      reason: z.string().describe('Why this is an emergency'),
    });

    const getPatientHistorySchema = z.object({
      limit: z.number().int().min(1).max(10).default(5),
    });

    const checkDrugInteractionSchema = z.object({
      medication: z.string().describe('Medication name to check'),
    });

    const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const system = buildSystemPrompt({ ...profile, liveLocation, triageIntake });

    const result = streamText({
      model: openai(modelName),
      system,
      messages,
      stopWhen: stepCountIs(20),
      tools: {
        // ── 1. Search hospitals ──────────────────────────────────────────────
        searchHospitals: tool({
          description:
            'Search for hospitals near the patient. If GPS coordinates are available they are used automatically ' +
            'for Haversine distance ranking — just call this tool and the closest hospitals are returned. ' +
            'Pass state/city only as a fallback hint when GPS is unavailable. ' +
            'Returns hospitals sorted by proximity with is_onboarded flag — use that to decide next steps.',
          inputSchema: searchHospitalsSchema,
          execute: async ({ state, has_emergency }) => {
            try {
              const stateClean = String(state || '').trim();
              const hasCoords = patientLat != null && patientLon != null;
              console.log(`[searchHospitals] state="${stateClean}" has_emergency=${has_emergency} patientCoords=${hasCoords ? `${patientLat},${patientLon}` : 'none'}`);

              // Fetch all active hospitals with coordinates
              let q = supabase
                .from('hospitals_directory')
                .select('id,name,city,state,country,type,tier,specialties,phone,website,has_emergency,is_onboarded,lat,lon')
                .eq('is_active', true);
              if (has_emergency) q = q.eq('has_emergency', true);

              const { data: all, error } = await q.limit(200);
              if (error) return { error: 'db_error', message: error.message };
              if (!all || all.length === 0) {
                return { error: 'no_hospitals', message: 'No hospitals found in the network. Tell the patient to call emergency services (199 or 112) or search Google Maps for nearby clinics.' };
              }

              let ranked;

              if (hasCoords) {
                // Haversine ranking: attach distance_km, sort ascending, take top 5
                ranked = all
                  .map((h) => ({
                    ...h,
                    distance_km: (h.lat != null && h.lon != null)
                      ? Math.round(haversineKm(patientLat, patientLon, h.lat, h.lon))
                      : 99999,
                  }))
                  .sort((a, b) => a.distance_km - b.distance_km)
                  .slice(0, 5)
                  .map(({ lat: _lat, lon: _lon, ...rest }) => rest); // strip raw coords from LLM response
                console.log(`[searchHospitals] Haversine top-5 distances: ${ranked.map((h) => `${h.name} ${h.distance_km}km`).join(' | ')}`);
              } else if (stateClean) {
                // Fallback: text-match on state
                const stateMatches = all.filter((h) =>
                  h.state?.toLowerCase().includes(stateClean.toLowerCase())
                );
                ranked = (stateMatches.length > 0 ? stateMatches : all).slice(0, 5)
                  .map(({ lat: _lat, lon: _lon, ...rest }) => rest);
                const note = stateMatches.length === 0
                  ? `No hospitals found near "${stateClean}" — showing available hospitals in the network instead. Inform the patient of this.`
                  : undefined;
                console.log(`[searchHospitals] state-text match → ${stateMatches.length} results`);
                return { hospitals: ranked, ...(note ? { note } : {}) };
              } else {
                return { error: 'no_location', message: 'Location is required. Ask the patient for their city or state before searching.' };
              }

              return { hospitals: ranked };
            } catch (e) {
              return { error: 'unexpected', message: String(e?.message ?? e) };
            }
          },
        }),

        // ── 2. Get booking info (slots OR phone script) ──────────────────────
        getHospitalBookingInfo: tool({
          description:
            'After searchHospitals, call this for the best hospital. ' +
            'If is_onboarded=true, returns available Google Meet slots. ' +
            'If is_onboarded=false, returns phone number and a ready-to-read call script.',
          inputSchema: getHospitalBookingInfoSchema,
          execute: async ({
            hospital_id, hospital_name, hospital_phone,
            is_onboarded, complaint, urgency, symptoms, recommended_specialty,
          }) => {
            try {
              if (is_onboarded) {
                const slots = await fetchAvailableSlots(7, 'Africa/Lagos');
                if (slots.length === 0) {
                  return {
                    type: 'onboarded_no_slots',
                    message: 'No available slots in the next 7 days. Tell the patient to call directly.',
                    phone: hospital_phone,
                  };
                }
                return {
                  type: 'onboarded',
                  hospital_id,
                  hospital_name,
                  available_slots: slots,
                  instructions: 'Present these slots to the patient and ask which they prefer. Then call bookAppointment.',
                };
              }

              // Not onboarded — generate phone script.
              const patientName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'the patient';
              const urgencyLine = urgency === 'emergency'
                ? 'This is an EMERGENCY. I need to be seen immediately.'
                : urgency === 'urgent'
                ? 'My situation is urgent and I need to be seen within 24–48 hours.'
                : 'I would like to schedule an appointment as soon as possible.';

              const script = `Hello, my name is ${patientName}. I am calling to book an appointment.

${urgencyLine}

Here is a summary of my situation: ${complaint}. My main symptoms are: ${symptoms.join(', ')}.${recommended_specialty ? ` I have been advised to see a ${recommended_specialty} specialist.` : ''}

Could you please let me know the earliest available appointment? I would also appreciate knowing your consultation fee and any documents I should bring.

Thank you.`;

              return {
                type: 'not_onboarded',
                hospital_name,
                phone: hospital_phone,
                call_script: script,
                instructions: 'Show the patient the phone number and this script to guide their call.',
              };
            } catch (e) {
              return { error: 'unexpected', message: String(e?.message ?? e) };
            }
          },
        }),

        // ── 3. Book Google Meet appointment ──────────────────────────────────
        bookAppointment: tool({
          description:
            'Book a Google Meet appointment for an onboarded hospital. ' +
            'Only call this after the patient confirms a specific slot from getHospitalBookingInfo.',
          inputSchema: bookAppointmentSchema,
          execute: async ({ hospital_id, starts_at_local, time_zone, reason }) => {
            try {
            const auth = await getClinicCalendarAuth();
            if (!auth) return { error: 'calendar_not_configured', message: 'Online booking is not available right now. Tell the patient to call the hospital directly to book their appointment.' };

            const { oauth2Client, calendarId } = auth;

            const { data: hospital } = await supabase
              .from('hospitals_directory')
              .select('id,name,is_onboarded')
              .eq('id', hospital_id)
              .maybeSingle();

            if (!hospital?.is_onboarded) {
              return { error: 'not_onboarded', message: 'This hospital does not support online booking. Tell the patient to call directly.' };
            }

            const tz = time_zone || 'Africa/Lagos';
            const startDt = DateTime.fromISO(String(starts_at_local), { zone: tz });
            if (!startDt.isValid) return { error: 'invalid_slot', message: 'The selected time slot is invalid. Ask the patient to pick a different slot.' };
            const endDt = startDt.plus({ minutes: 30 });

            const cal = google.calendar({ version: 'v3', auth: oauth2Client });
            const requestId = `ogwu-${profile.id}-${Date.now()}`;

            let created;
            try {
              const res = await cal.events.insert({
                calendarId,
                conferenceDataVersion: 1,
                requestBody: {
                  summary: `Ogwu consult — ${hospital.name}`,
                  description: `Reason: ${reason}\nPatient ID: ${profile.id}`,
                  start: { dateTime: startDt.toISO(), timeZone: tz },
                  end: { dateTime: endDt.toISO(), timeZone: tz },
                  conferenceData: {
                    createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } },
                  },
                },
              });
              created = res.data;
            } catch (e) {
              return { error: `Calendar error: ${e?.message}` };
            }

            const meetingUrl =
              created?.hangoutLink ||
              created?.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
              null;

            const startsAtUtc = startDt.toUTC().toISO();

            const { data: appt, error: apptErr } = await supabase
              .from('appointments')
              .insert({
                patient_id: profile.id,
                hospital_id: hospital.id,
                status: 'scheduled',
                starts_at: startsAtUtc,
                duration_minutes: 30,
                patient_time_zone: tz,
                provider_time_zone: tz,
                calendar_event_id: created?.id || null,
                meeting_url: meetingUrl,
                reason: safeText(reason, 500),
                updated_at: new Date().toISOString(),
              })
              .select('id,starts_at,meeting_url')
              .single();

            if (apptErr) {
              // Best-effort cleanup.
              if (created?.id) {
                try { await cal.events.delete({ calendarId, eventId: created.id }); } catch {}
              }
              return { error: 'db_error', message: apptErr.message };
            }

            return {
              success: true,
              appointment_id: appt.id,
              starts_at: appt.starts_at,
              meeting_url: meetingUrl,
              message: meetingUrl
                ? `Appointment booked! Google Meet link: ${meetingUrl}`
                : 'Appointment booked. A Meet link will be sent shortly.',
            };
            } catch (e) {
              return { error: 'unexpected', message: String(e?.message ?? e) };
            }
          },
        }),

        // ── 4. Save consult record ────────────────────────────────────────────
        createConsult: tool({
          description: 'Save a structured consult record once triage is complete. Call automatically.',
          inputSchema: createConsultSchema,
          execute: async (params) => {
            try {
              const payload = {
                patient_id: profile.id,
                complaint: safeText(params.complaint, 400),
                urgency: normalizeUrgency(params.urgency),
                symptoms: Array.isArray(params.symptoms) ? params.symptoms.map((s) => safeText(s, 80)).filter(Boolean) : [],
                recommended_specialty: params.recommended_specialty ? safeText(params.recommended_specialty, 80) : null,
                care_pathway: safeText(params.care_pathway, 4000),
                recommended_hospital_ids: Array.isArray(params.recommended_hospital_ids)
                  ? params.recommended_hospital_ids.map(String)
                  : null,
                is_emergency_flagged: !!params.is_emergency_flagged,
              };

              const { data, error } = await supabase
                .from('consults')
                .insert(payload)
                .select('id')
                .single();

              if (error) return { success: false, error: error.message };
              return { success: true, consult_id: data.id };
            } catch (e) {
              return { success: false, error: String(e?.message ?? e) };
            }
          },
        }),

        // ── 5. Flag emergency ─────────────────────────────────────────────────
        flagEmergency: tool({
          description: 'Flag an emergency. Call immediately when symptoms suggest one — before other tools.',
          inputSchema: flagEmergencySchema,
          execute: async ({ reason }) => ({
            flagged: true,
            reason: safeText(reason, 300),
            message: 'Emergency flagged. If in immediate danger, call emergency services or go to the nearest A&E now.',
          }),
        }),

        // ── 6. Patient history ────────────────────────────────────────────────
        getPatientHistory: tool({
          description: "Retrieve the patient's recent consult history.",
          inputSchema: getPatientHistorySchema,
          execute: async ({ limit }) => {
            try {
              const lim = Math.max(1, Math.min(10, Number(limit || 5)));
              const { data, error } = await supabase
                .from('consults')
                .select('id,complaint,urgency,care_pathway,created_at')
                .eq('patient_id', profile.id)
                .order('created_at', { ascending: false })
                .limit(lim);
              if (error) return { error: error.message };
              return { history: data || [] };
            } catch (e) {
              return { error: String(e?.message ?? e) };
            }
          },
        }),

        // ── 7. Drug interaction check ─────────────────────────────────────────
        checkDrugInteraction: tool({
          description: "Check if a medication is safe given the patient's allergies.",
          inputSchema: checkDrugInteractionSchema,
          execute: async ({ medication }) => {
            const med = safeText(medication, 80);
            const allergies = String(profile?.allergies || '').split(',').map((x) => x.trim()).filter(Boolean);
            const risks = allergies.filter((a) => med.toLowerCase().includes(a.toLowerCase()))
              .map((a) => `Patient reports allergy to ${a}`);
            return {
              medication: med,
              risks,
              safe: risks.length === 0,
              note: 'Basic check only. Always confirm with a pharmacist or clinician.',
            };
          },
        }),
      },
    });

    // Emit v4-compatible data stream (what @ai-sdk/ui-utils@1.x expects).
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
        console.log(`[stream] type=${part.type}${part.toolName ? ` tool=${part.toolName}` : ''}${part.finishReason ? ` reason=${part.finishReason}` : ''}`);
        switch (part.type) {
          case 'text-delta':
            hasText = true;
            writePart('0', part.text);
            break;
          case 'tool-input-start': writePart('b', { toolCallId: part.id, toolName: part.toolName }); break;
          case 'tool-input-delta': writePart('c', { toolCallId: part.id, argsTextDelta: part.delta }); break;
          case 'tool-call':
            writePart('9', { toolCallId: part.toolCallId, toolName: part.toolName, args: part.input });
            break;
          case 'tool-result':
            console.log(`[stream] tool-result output: ${JSON.stringify(part.output).slice(0, 300)}`);
            writePart('a', { toolCallId: part.toolCallId, result: part.output });
            break;
          case 'start-step':
            stepCount++;
            console.log(`[stream] --- step ${stepCount} start ---`);
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
            console.error(`[stream] error event:`, part.error);
            writePart('3', String(part.error?.message ?? part.error ?? 'Unknown error'));
            break;
        }
      }
    } catch (streamErr) {
      console.error(`[stream] caught:`, streamErr?.message);
      writePart('3', String(streamErr?.message ?? 'Stream error'));
    }

    // If the model finished without emitting any text (e.g. maxSteps hit mid-tool-chain,
    // or model called tools but never generated a reply), inject a visible fallback.
    if (!hasText) {
      const finishReason = finishPart?.finishReason ?? 'unknown';
      console.error(`[agent] Stream ended with no text. finishReason=${finishReason} userId=${req.user?.id}`);
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
    return;
  } catch (err) {
    if (!res.headersSent) {
      res.status(400).json({ error: err?.message || 'Failed to run agent' });
    }
  }
});

module.exports = router;
