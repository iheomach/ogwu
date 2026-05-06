const serverError = require('../lib/serverError');
const express = require('express');
const { google } = require('googleapis');
const { DateTime } = require('luxon');

const router = express.Router();

const authenticate = require('../middleware/auth');
const supabase = require('../lib/supabase');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function getOAuthClient() {
  const clientId = requireEnv('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_OAUTH_CLIENT_SECRET');
  const redirectUri = requireEnv('GOOGLE_OAUTH_REDIRECT_URI');
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function isValidIanaZone(zone) {
  return !!zone && DateTime.now().setZone(zone).isValid;
}

function parseStart({ starts_at_local, time_zone }) {
  if (!starts_at_local) throw new Error('starts_at_local is required');
  if (!time_zone) throw new Error('time_zone is required');
  if (!isValidIanaZone(time_zone)) throw new Error(`Invalid time_zone: ${time_zone}`);

  // Expect starts_at_local like "2026-04-10T14:30" (no offset). Interpret in provided IANA zone.
  const dt = DateTime.fromISO(String(starts_at_local), { zone: time_zone });
  if (!dt.isValid) throw new Error('Invalid starts_at_local');
  return dt;
}

async function getClinicCalendarAuth() {
  const { data, error } = await supabase
    .from('integration_tokens')
    .select('refresh_token, access_token, expiry, meta')
    .eq('provider', 'google_calendar')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.refresh_token) throw new Error('Clinic Google Calendar is not connected');

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: data.refresh_token,
    access_token: data.access_token || undefined,
    expiry_date: data.expiry ? new Date(data.expiry).getTime() : undefined,
  });

  const calendarId = data?.meta?.calendar_id || process.env.GOOGLE_CLINIC_CALENDAR_ID || 'primary';
  return { oauth2Client, calendarId };
}

// Create an appointment and schedule a Google Meet (only for onboarded providers).
router.post('/', authenticate, async (req, res) => {
  try {
    const patientId = req.user.id;

    const doctorId = req.body?.doctor_id || null;
    const hospitalId = req.body?.hospital_id || null;

    // Client must specify time zones before selection.
    const patientTimeZone = String(req.body?.patient_time_zone || '').trim();
    const providerTimeZone = String(req.body?.provider_time_zone || '').trim();
    if (!isValidIanaZone(patientTimeZone)) {
      return res.status(400).json({ error: 'Invalid patient_time_zone' });
    }
    if (!isValidIanaZone(providerTimeZone)) {
      return res.status(400).json({ error: 'Invalid provider_time_zone' });
    }

    const startInProviderZone = parseStart({
      starts_at_local: req.body?.starts_at_local,
      time_zone: providerTimeZone,
    });

    const durationMinutes = Number(req.body?.duration_minutes || 30);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 10 || durationMinutes > 180) {
      return res.status(400).json({ error: 'Invalid duration_minutes' });
    }

    const reason = req.body?.reason ? String(req.body.reason).slice(0, 500) : null;
    const callScript = req.body?.call_script ? String(req.body.call_script).slice(0, 4000) : null;

    // Hospital-centric scheduling: require an onboarded hospital/clinic to schedule a Meet.
    if (!hospitalId) {
      return res.status(400).json({ error: 'hospital_id is required to schedule a Meet' });
    }

    const { data: hospital, error: hospitalErr } = await supabase
      .from('hospitals_directory')
      .select('id,name,country,admin1,location,is_onboarded')
      .eq('id', hospitalId)
      .maybeSingle();

    if (hospitalErr) return serverError(res, hospitalErr, 'An error occurred.');
    if (!hospital) return res.status(404).json({ error: 'Hospital not found' });
    if (hospital.is_onboarded === false) {
      return res.status(400).json({ error: 'Hospital is not onboarded for scheduling yet' });
    }

    // Doctor is optional metadata (if you still keep a short curated onboarded list).
    let doctor = null;
    if (doctorId) {
      const { data: d, error: doctorErr } = await supabase
        .from('doctors')
        .select('id,name,primary_specialty,hospital_name')
        .eq('id', doctorId)
        .maybeSingle();
      if (doctorErr) return res.status(500).json({ error: doctorErr.message });
      doctor = d || null;
    }

    const { oauth2Client, calendarId } = await getClinicCalendarAuth();
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const endInProviderZone = startInProviderZone.plus({ minutes: durationMinutes });

    const requestId = `ogwu-${patientId}-${Date.now()}`;

    const eventSummary = doctor?.name
      ? `Ogwu consult: ${doctor.name} (${hospital.name})`
      : `Ogwu consult: ${hospital.name}`;
    const descriptionLines = [
      `Hospital: ${hospital.name}`,
      hospital.location ? `Location: ${hospital.location}` : null,
      hospital.admin1 ? `State/UT: ${hospital.admin1}` : null,
      hospital.country ? `Country: ${hospital.country}` : null,
      doctor?.name ? `Clinician (optional): ${doctor.name}` : null,
      doctor?.primary_specialty ? `Specialty: ${doctor.primary_specialty}` : null,
      reason ? `Reason: ${reason}` : null,
      callScript ? `Call script:\n${callScript}` : null,
    ].filter(Boolean);

    const event = {
      summary: eventSummary,
      description: descriptionLines.join('\n'),
      start: {
        dateTime: startInProviderZone.toISO(),
        timeZone: providerTimeZone,
      },
      end: {
        dateTime: endInProviderZone.toISO(),
        timeZone: providerTimeZone,
      },
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };

    const created = await calendar.events.insert({
      calendarId,
      requestBody: event,
      conferenceDataVersion: 1,
    });

    const createdEvent = created?.data;
    const meetingUrl =
      createdEvent?.hangoutLink ||
      createdEvent?.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
      null;

    const startsAtUtcIso = startInProviderZone.toUTC().toISO();

    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .insert({
        patient_id: patientId,
        doctor_id: doctor?.id || null,
        hospital_id: hospital.id,
        status: 'scheduled',
        starts_at: startsAtUtcIso,
        duration_minutes: durationMinutes,
        patient_time_zone: patientTimeZone,
        provider_time_zone: providerTimeZone,
        calendar_event_id: createdEvent?.id || null,
        meeting_url: meetingUrl,
        reason,
        call_script: callScript,
        updated_at: new Date().toISOString(),
      })
      .select('id,starts_at,duration_minutes,meeting_url,status,doctor_id,hospital_id')
      .single();

    if (apptErr) {
      // Best-effort cleanup: delete created calendar event if DB insert failed.
      try {
        if (createdEvent?.id) await calendar.events.delete({ calendarId, eventId: createdEvent.id });
      } catch {
        // ignore
      }
      return serverError(res, apptErr, 'Failed to create appointment.');
    }

    return res.json({ appointment: appt });
  } catch (e) {
    return serverError(res, e, 'Failed to schedule appointment.', 400);
  }
});

// List current user's appointments.
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('id,starts_at,duration_minutes,status,meeting_url,doctor_id,hospital_id,created_at')
      .eq('patient_id', req.user.id)
      .order('starts_at', { ascending: true });

    if (error) return serverError(res, error, 'An error occurred.');
    return res.json({ appointments: data || [] });
  } catch (e) {
    return serverError(res, e, 'Failed to load appointments.');
  }
});

module.exports = router;
