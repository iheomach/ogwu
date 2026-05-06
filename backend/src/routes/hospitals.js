const serverError = require('../lib/serverError');
const express = require('express');
const router = express.Router();

const supabase = require('../lib/supabase');
const authenticate = require('../middleware/auth');

// List onboarded hospitals for patients to send intakes to
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('hospitals_directory')
      .select('id, name, location, specialty_tags, admin1, country')
      .eq('is_onboarded', true)
      .order('name', { ascending: true });

    if (error) return serverError(res, error, 'Failed to load hospitals.');
    return res.json({ hospitals: data ?? [] });
  } catch (err) {
    return serverError(res, err, 'Failed to load hospitals.');
  }
});

module.exports = router;
