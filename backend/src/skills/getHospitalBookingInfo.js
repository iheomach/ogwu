module.exports = function getHospitalBookingInfoSkill({ z, profile, supabase, fetchAvailableSlots }) {
  return {
    inputSchema: z.object({
      hospital_id: z.string().describe('UUID of the hospital from searchHospitals results'),
      hospital_name: z.string().describe('Name of the hospital for context'),
      hospital_phone: z.string().describe('Phone number of the hospital'),
      is_onboarded: z.boolean().describe('Whether the hospital is onboarded on Ogwu'),
      complaint: z.string().describe("Patient's chief complaint"),
      urgency: z.enum(['emergency', 'urgent', 'routine', 'self_care']),
      symptoms: z.array(z.string()).describe('List of reported symptoms'),
      recommended_specialty: z.string().optional(),
    }),
    execute: async ({ hospital_id, hospital_name, hospital_phone, is_onboarded: agent_is_onboarded, complaint, urgency, symptoms, recommended_specialty }) => {
      try {
        // Verify is_onboarded from DB — never trust the agent's value alone
        // Try by UUID first, fall back to name match in case agent passed a slug
        let is_onboarded = agent_is_onboarded;
        let { data: hosp } = await supabase
          .from('hospitals_directory')
          .select('id, is_onboarded, phone')
          .eq('id', hospital_id)
          .maybeSingle();
        if (!hosp) {
          const { data: byName } = await supabase
            .from('hospitals_directory')
            .select('id, is_onboarded, phone')
            .ilike('name', hospital_name)
            .maybeSingle();
          hosp = byName;
        }
        if (hosp) {
          hospital_id = hosp.id; // always use real UUID downstream
          is_onboarded = hosp.is_onboarded === true;
          if (!hospital_phone && hosp.phone) hospital_phone = hosp.phone;
        }

        if (is_onboarded) {
          const slots = await fetchAvailableSlots(7, 'Africa/Lagos');
          if (slots.length === 0) {
            return { type: 'onboarded_no_slots', message: 'No available slots in the next 7 days. Tell the patient to call directly.', phone: hospital_phone };
          }
          return { type: 'onboarded', hospital_id, hospital_name, available_slots: slots, instructions: 'Present these slots to the patient and ask which they prefer. Then call bookAppointment.' };
        }

        const patientName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'the patient';
        const urgencyLine = urgency === 'emergency'
          ? 'This is an EMERGENCY. I need to be seen immediately.'
          : urgency === 'urgent'
          ? 'My situation is urgent and I need to be seen within 24–48 hours.'
          : 'I would like to schedule an appointment as soon as possible.';

        const call_script = `Hello, my name is ${patientName}. I am calling to book an appointment.

${urgencyLine}

Here is a summary of my situation: ${complaint}. My main symptoms are: ${symptoms.join(', ')}.${recommended_specialty ? ` I have been advised to see a ${recommended_specialty} specialist.` : ''}

Could you please let me know the earliest available appointment? I would also appreciate knowing your consultation fee and any documents I should bring.

Thank you.`;

        return { type: 'not_onboarded', hospital_name, phone: hospital_phone, call_script, instructions: 'IMPORTANT: Copy the call_script above to the patient word for word. Do not paraphrase, rewrite, or generate a new script. The script already has the patient\'s real name in it.' };
      } catch (e) {
        return { error: 'unexpected', message: String(e?.message ?? e) };
      }
    },
  };
};
