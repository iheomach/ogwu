/**
 * Geocode hospitals in hospitals_directory using Nominatim (OpenStreetMap).
 * Adds lat/lon to every row that is missing coordinates.
 *
 * Rate limit: 1 request/second (Nominatim policy).
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   node scripts/geocodeHospitals.js
 */

try { require('dotenv').config({ path: require('path').join(__dirname, '../.env') }); } catch {}

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Usage: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/geocodeHospitals.js');
  process.exit(1);
}

const supabase = createClient(url, key);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function geocodeNominatim(name, city, state, country) {
  const countryName = country === 'NG' ? 'Nigeria' : country === 'IN' ? 'India' : 'United States';
  // Try progressively broader queries until we get a result.
  const queries = [
    `${name}, ${city}, ${state}, ${countryName}`,
    `${name}, ${state}, ${countryName}`,
    `${city}, ${state}, ${countryName}`,
  ];

  for (const q of queries) {
    const encoded = encodeURIComponent(q);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
      {
        headers: {
          'User-Agent': 'OgwuHealthApp/1.0 (geocodeHospitals script; contact: admin@ogwu.health)',
        },
      }
    );

    if (!res.ok) {
      console.warn(`  Nominatim HTTP ${res.status} for: ${q}`);
      await sleep(1100);
      continue;
    }

    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), query: q };
    }

    await sleep(1100); // respect 1 req/sec rate limit between queries
  }

  return null;
}

async function main() {
  // Fetch all hospitals missing lat or lon
  const { data: hospitals, error } = await supabase
    .from('hospitals_directory')
    .select('id, name, city, state, country')
    .or('lat.is.null,lon.is.null')
    .order('country')
    .order('state');

  if (error) {
    console.error('Failed to fetch hospitals:', error.message);
    process.exit(1);
  }

  console.log(`Found ${hospitals.length} hospitals missing coordinates.`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < hospitals.length; i++) {
    const h = hospitals[i];
    console.log(`[${i + 1}/${hospitals.length}] ${h.name}, ${h.city}, ${h.state} (${h.country})`);

    const result = await geocodeNominatim(h.name, h.city, h.state, h.country);

    if (!result) {
      console.warn(`  ✗ No coordinates found`);
      failed++;
    } else {
      const { error: updateErr } = await supabase
        .from('hospitals_directory')
        .update({ lat: result.lat, lon: result.lon })
        .eq('id', h.id);

      if (updateErr) {
        console.warn(`  ✗ DB update failed: ${updateErr.message}`);
        failed++;
      } else {
        console.log(`  ✓ lat=${result.lat.toFixed(4)}, lon=${result.lon.toFixed(4)}  (via: ${result.query})`);
        success++;
      }
    }

    // Nominatim: max 1 req/sec. We already sleep between queries inside geocodeNominatim,
    // but add a small buffer between hospitals to be safe.
    if (i < hospitals.length - 1) await sleep(200);
  }

  console.log(`\nDone. Success: ${success}, Failed: ${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
