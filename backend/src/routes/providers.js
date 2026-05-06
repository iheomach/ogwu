const serverError = require('../lib/serverError');
const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/auth');

const fetchImpl = global.fetch || require('node-fetch');

function normalizeQuery(q) {
  return String(q || '').trim().slice(0, 120);
}

function extractPhones(text) {
  const s = String(text || '');
  // Basic phone matcher; will include country codes when present.
  const re = /\+?\d[\d\s().-]{7,}\d/g;
  const matches = s.match(re) || [];
  const cleaned = matches
    .map((m) => m.replace(/\s+/g, ' ').trim())
    .filter((m) => m.length >= 8 && m.length <= 24);
  return Array.from(new Set(cleaned));
}

function extractEmails(text) {
  const s = String(text || '');
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const matches = s.match(re) || [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase())));
}

async function serpapiLookup(query) {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    return {
      providers: [],
      notice:
        'Provider lookup is not configured on the server yet. Set SERPAPI_API_KEY to enable automatic public contact lookup.',
      suggested_queries: [
        `${query} phone number`,
        `${query} appointment booking`,
        `${query} contact email`,
      ],
    };
  }

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', `${query} contact phone email appointment booking`);
  url.searchParams.set('api_key', apiKey);

  const resp = await fetchImpl(url.toString());
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Lookup failed (${resp.status}): ${txt}`);
  }

  const json = await resp.json();

  const out = [];

  const kg = json?.knowledge_graph;
  if (kg && (kg.title || kg.phone || kg.website)) {
    out.push({
      name: kg.title || query,
      phone: kg.phone || null,
      website: kg.website || null,
      booking_url: null,
      email: null,
      address: kg.address || null,
      source_url: kg.website || null,
    });
  }

  const organic = Array.isArray(json?.organic_results) ? json.organic_results : [];
  for (const r of organic.slice(0, 8)) {
    const title = r?.title ? String(r.title) : null;
    const link = r?.link ? String(r.link) : null;
    const snippet = r?.snippet ? String(r.snippet) : '';

    const phones = extractPhones(`${title || ''} ${snippet}`);
    const emails = extractEmails(`${title || ''} ${snippet}`);

    const bookingUrl = link && /(book|appointment|schedule|reserv)/i.test(link) ? link : null;

    if (!title && !link) continue;

    // Only include if we found something useful.
    if (phones.length === 0 && emails.length === 0 && !bookingUrl) continue;

    out.push({
      name: title || query,
      phone: phones[0] || null,
      email: emails[0] || null,
      website: link,
      booking_url: bookingUrl,
      address: null,
      source_url: link,
    });
  }

  // De-dupe by website + phone
  const seen = new Set();
  const providers = [];
  for (const p of out) {
    const key = `${p.website || ''}|${p.phone || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    providers.push(p);
    if (providers.length >= 5) break;
  }

  return { providers, notice: null, suggested_queries: [] };
}

// Lookup public contact info for a non-onboarded doctor/hospital.
// NOTE: We do not message providers directly from the backend; the app opens SMS/email/call with the results.
router.post('/lookup', authenticate, async (req, res) => {
  try {
    const query = normalizeQuery(req.body?.query);
    if (!query) return res.status(400).json({ error: 'query is required' });

    const result = await serpapiLookup(query);
    return res.json(result);
  } catch (err) {
    return serverError(res, err, 'Failed to lookup provider contact info.', 400);
  }
});

module.exports = router;
