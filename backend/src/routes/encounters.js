const serverError = require('../lib/serverError');
const express = require('express');
const router = express.Router();

const supabase = require('../lib/supabase');
const authenticate = require('../middleware/auth');
const healthlake = require('../lib/healthlake');

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

    const intake = await healthlake.getTriageIntake(req.user.id);
    if (!intake) return res.status(400).json({ error: 'No intake found to share' });

    // Write clinical data to HealthLake first; get back the FHIR id for linking.
    const fhir_encounter_id = await healthlake.writeEncounter(req.user.id, {
      urgency: intake.urgency,
      summary: intake.summary,
      safety_note: intake.safety_note,
      answers: intake.answers,
    }).catch((err) => {
      console.warn('[healthlake] encounter write failed:', err.message);
      return null;
    });

    // Store only operational fields in Supabase, linked by fhir_encounter_id.
    const { data, error } = await supabase
      .from('encounters')
      .insert({
        patient_id: req.user.id,
        doctor_id,
        source: 'share',
        status: 'shared',
        locale: intake.locale,
        fhir_encounter_id,
      })
      .select('id, patient_id, doctor_id, source, status, locale, fhir_encounter_id, created_at')
      .single();

    if (error) return serverError(res, error, 'Failed to create encounter.');

    return res.json({ encounter: data });
  } catch (e) {
    return serverError(res, e, 'Failed to create encounter.');
  }
});

module.exports = router;
