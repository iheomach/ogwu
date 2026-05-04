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

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ hospitals: data ?? [] });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load hospitals' });
  }
});

module.exports = router;
