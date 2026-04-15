const express = require('express');
const router = express.Router();

const supabase = require('../lib/supabase');
const authenticate = require('../middleware/auth');

// GET /api/report — aggregated health report for the signed-in patient
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const [profileRes, intakeRes, consultsRes, appointmentsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('first_name, middle_name, last_name, dob, biological_sex, allergies, known_conditions')
        .eq('id', userId)
        .maybeSingle(),

      supabase
        .from('triage_intakes')
        .select('urgency, summary, safety_note, answers, updated_at')
        .eq('user_id', userId)
        .maybeSingle(),

      supabase
        .from('consults')
        .select('complaint, urgency, symptoms, recommended_specialty, care_pathway, created_at')
        .eq('patient_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),

      supabase
        .from('appointments')
        .select('starts_at, duration_minutes, status, meeting_url, reason, hospital_id, created_at')
        .eq('patient_id', userId)
        .order('starts_at', { ascending: false })
        .limit(5),
    ]);

    // Enrich appointments with hospital names
    const appointments = appointmentsRes.data || [];
    const hospitalIds = [...new Set(appointments.map((a) => a.hospital_id).filter(Boolean))];
    let hospitalsMap = {};
    if (hospitalIds.length > 0) {
      const { data: hospitals } = await supabase
        .from('hospitals_directory')
        .select('id, name')
        .in('id', hospitalIds);
      if (hospitals) {
        hospitalsMap = Object.fromEntries(hospitals.map((h) => [h.id, h.name]));
      }
    }

    return res.json({
      profile: profileRes.data || null,
      intake: intakeRes.data || null,
      consults: consultsRes.data || [],
      appointments: appointments.map((a) => ({
        ...a,
        hospital_name: hospitalsMap[a.hospital_id] || null,
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Failed to generate report' });
  }
});

module.exports = router;
