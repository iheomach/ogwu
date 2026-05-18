const serverError = require('../lib/serverError');
const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/auth');
const healthlake = require('../lib/healthlake');

// Allowed fields a user may update on their own profile
const UPDATABLE_FIELDS = [
  'first_name',
  'middle_name',
  'last_name',
  'dob',
  'biological_sex',
  'allergies',
  'avatar_url',
  'phone',
  'known_conditions',
];

// Get user profile (authenticated)
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) return res.status(404).json({ error: 'Profile not found.' });
    res.json(data);
  } catch (err) {
    return serverError(res, err, 'Failed to load profile.');
  }
});

// Update user profile (authenticated, own profile only)
router.put('/:id', authenticate, async (req, res) => {
  if (req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const updates = {};
  for (const field of UPDATABLE_FIELDS) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: 'Failed to update profile.' });

    // Mirror clinical fields to HealthLake as a fire-and-forget side effect.
    Promise.allSettled([
      healthlake.upsertPatient({ id: req.params.id, ...data }),
      ...(updates.known_conditions !== undefined ? [healthlake.writeConditions(req.params.id, data.known_conditions)] : []),
      ...(updates.allergies !== undefined ? [healthlake.writeAllergies(req.params.id, data.allergies)] : []),
    ]).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length) console.warn('[healthlake] profile sync failed:', failed.map((r) => r.reason?.message));
    });

    res.json(data);
  } catch (err) {
    return serverError(res, err, 'Failed to update profile.');
  }
});

module.exports = router;
