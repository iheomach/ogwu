const serverError = require('../lib/serverError');
const express = require('express');
const router = express.Router();

const supabase = require('../lib/supabase');
const authenticate = require('../middleware/auth');

// Public doctor directory for patients.
// NOTE: Never return password_hash.
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select(
        [
          'id',
          'name',
          'title',
          'primary_specialty',
          'tags',
          'languages',
          'hospital_name',
          'location',
          'about',
          'contact_phone',
          'contact_url',
          'price_guide',
          'sort_rank',
        ].join(',')
      )
      .order('sort_rank', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) return serverError(res, error, 'Failed to load doctors.');
    return res.json({ doctors: data || [] });
  } catch (e) {
    return serverError(res, e, 'Failed to load doctors.');
  }
});

module.exports = router;
