const serverError = require('../lib/serverError');
const express = require('express');
const router = express.Router();

const supabase = require('../lib/supabase');
const authenticate = require('../middleware/auth');

// List encounters for the signed-in patient
router.get('/', authenticate, async (req, res) => {
  try {
    const baseSelect = [
      'id',
      'patient_id',
      'doctor_id',
      'source',
      'status',
      'locale',
      'urgency',
      'summary',
      'safety_note',
      'created_at',
    ];

    // Prefer embedding doctor info when possible.
    let { data, error } = await supabase
      .from('encounters')
      .select([...baseSelect, 'doctor:doctors(id,name,primary_specialty,hospital_name,location)'].join(','))
      .eq('patient_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      // Fallback: return encounters without embedded doctor info.
      const retry = await supabase
        .from('encounters')
        .select(baseSelect.join(','))
        .eq('patient_id', req.user.id)
        .order('created_at', { ascending: false });
      data = retry.data;
      error = retry.error;
    }

    if (error) return serverError(res, error, 'Failed to load encounters.');
    return res.json({ encounters: data || [] });
  } catch (e) {
    return serverError(res, e, 'Failed to load encounters.');
  }
});

// Create an encounter by snapshotting the latest saved intake
router.post('/share', authenticate, async (req, res) => {
  try {
    const doctor_id = typeof req.body?.doctor_id === 'string' ? req.body.doctor_id : null;

    const { data: intake, error: intakeError } = await supabase
      .from('triage_intakes')
      .select('locale, urgency, summary, safety_note')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (intakeError) return serverError(res, intakeError, 'Failed to load intake.');
    if (!intake) return res.status(400).json({ error: 'No intake found to share' });

    const { data, error } = await supabase
      .from('encounters')
      .insert({
        patient_id: req.user.id,
        doctor_id,
        source: 'share',
        status: 'shared',
        locale: intake.locale,
        urgency: intake.urgency,
        summary: intake.summary,
        safety_note: intake.safety_note,
      })
      .select('id, patient_id, doctor_id, source, status, locale, urgency, summary, safety_note, created_at')
      .single();

    if (error) return serverError(res, error, 'Failed to create encounter.');

    return res.json({ encounter: data });
  } catch (e) {
    return serverError(res, e, 'Failed to create encounter.');
  }
});

module.exports = router;
