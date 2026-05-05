const { google } = require('googleapis');
const { DateTime } = require('luxon');

module.exports = function bookAppointmentSkill({ z, supabase, profile, getClinicCalendarAuth, safeText }) {
  return {
    inputSchema: z.object({
      hospital_id: z.string().describe('UUID of the onboarded hospital'),
      starts_at_local: z.string().describe("Slot start from getHospitalBookingInfo, e.g. '2026-04-10T09:00'"),
      time_zone: z.string().describe("Patient's IANA timezone from the slot — used to interpret starts_at_local"),
      provider_time_zone: z.string().optional().describe("Clinic's IANA timezone from the slot — used for the calendar event"),
      reason: z.string().describe('Brief appointment reason'),
    }),
    execute: async ({ hospital_id, starts_at_local, time_zone, provider_time_zone, reason }) => {
      try {
        const auth = await getClinicCalendarAuth();
        if (!auth) return { error: 'calendar_not_configured', message: 'Online booking is not available right now. Tell the patient to call the hospital directly.' };

        const { oauth2Client, calendarId } = auth;

        let { data: hospital } = await supabase
          .from('hospitals_directory')
          .select('id,name,is_onboarded')
          .eq('id', hospital_id)
          .maybeSingle();

        // Fallback: agent may pass a slug instead of UUID — try name match
        if (!hospital) {
          const { data: byName } = await supabase
            .from('hospitals_directory')
            .select('id,name,is_onboarded')
            .ilike('name', hospital_id.replace(/_/g, ' '))
            .maybeSingle();
          hospital = byName;
        }

        if (!hospital) return { error: 'hospital_not_found', message: `No hospital found with id: ${hospital_id}` };
        if (!hospital.is_onboarded) return { error: 'not_onboarded', message: 'This hospital does not support online booking. Tell the patient to call directly.' };

        // Parse the slot in the patient's local timezone
        const patientTz = time_zone || 'UTC';
        const providerTz = provider_time_zone || patientTz;
        const startInPatientZone = DateTime.fromISO(String(starts_at_local), { zone: patientTz });
        if (!startInPatientZone.isValid) return { error: 'invalid_slot', message: 'The selected time slot is invalid. Ask the patient to pick a different slot.' };

        // Convert to provider timezone for the calendar event
        const startInProviderZone = startInPatientZone.setZone(providerTz);
        const endInProviderZone = startInProviderZone.plus({ minutes: 30 });

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
              start: { dateTime: startInProviderZone.toISO(), timeZone: providerTz },
              end: { dateTime: endInProviderZone.toISO(), timeZone: providerTz },
              conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
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

        const { data: appt, error: apptErr } = await supabase
          .from('appointments')
          .insert({
            patient_id: profile.id,
            hospital_id: hospital.id,
            status: 'scheduled',
            starts_at: startInPatientZone.toUTC().toISO(),
            duration_minutes: 30,
            patient_time_zone: patientTz,
            provider_time_zone: providerTz,
            calendar_event_id: created?.id || null,
            meeting_url: meetingUrl,
            reason: safeText(reason, 500),
            updated_at: new Date().toISOString(),
          })
          .select('id,starts_at,meeting_url')
          .single();

        if (apptErr) {
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
          hospital_id: hospital.id,
          hospital_name: hospital.name,
          message: meetingUrl ? `Appointment booked! Meeting link: ${meetingUrl}` : 'Appointment booked. A meeting link will be sent shortly.',
        };
      } catch (e) {
        return { error: 'unexpected', message: String(e?.message ?? e) };
      }
    },
  };
};
