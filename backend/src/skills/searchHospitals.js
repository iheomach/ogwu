'use strict';

const googlePlaces = require('../lib/googlePlaces');

const fetchImpl = global.fetch || require('node-fetch');

async function openaiJsonCall(messages) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      messages,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const { choices } = await res.json();
  return JSON.parse(choices?.[0]?.message?.content ?? '{}');
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;       // 24 h — Places API cache
const SPECIALTY_TTL_DAYS = 30;                    // 30-day TTL for LLM specialty inference
const GEO_PRECISION = 3;                          // bucket lat/lon to ~111 m grid
const DEFAULT_RADIUS_M = googlePlaces.DEFAULT_RADIUS_M;

const VALID_SPECIALTIES = [
  'general', 'pediatrics', 'maternity', 'cardiology', 'orthopedics',
  'ophthalmology', 'multi-specialty', 'dental', 'psychiatric',
];

// ICD-10 prefix → preferred specialty
const ICD_TO_SPECIALTY = {
  I: 'cardiology',
  O: 'maternity',
  H5: 'ophthalmology',
  H6: 'ophthalmology',
  F: 'psychiatric',
  M: 'orthopedics',
  K: 'general',
  Z: 'general',
};

function bucket(coord) {
  const factor = Math.pow(10, GEO_PRECISION);
  return Math.round(coord * factor) / factor;
}

function preferredSpecialtyFromTriage(triageContext) {
  if (!triageContext?.extracted_entities) return null;
  for (const e of triageContext.extracted_entities) {
    const code = e.icd10Code || '';
    for (const [prefix, specialty] of Object.entries(ICD_TO_SPECIALTY)) {
      if (code.startsWith(prefix)) return specialty;
    }
  }
  if (triageContext.urgency === 'emergency') return 'general';
  return null;
}

async function inferSpecialty(place, openaiJsonCall) {
  const name = place.displayName?.text || '';
  const summary = place.editorialSummary?.text || '';
  const types = (place.types || []).join(', ');

  const messages = [
    {
      role: 'system',
      content:
        `Classify this Nigerian hospital into exactly one specialty. ` +
        `Return ONLY JSON: { "specialty": string, "confidence": number }. ` +
        `specialty must be one of: ${VALID_SPECIALTIES.join(', ')}. ` +
        `confidence is 0.0–1.0.`,
    },
    {
      role: 'user',
      content: `Name: ${name}\nGoogle types: ${types}\nDescription: ${summary}`,
    },
  ];

  try {
    const result = await openaiJsonCall(messages);
    const specialty = VALID_SPECIALTIES.includes(result.specialty) ? result.specialty : 'general';
    const confidence = typeof result.confidence === 'number' ? Math.min(1, Math.max(0, result.confidence)) : 0.5;
    return { specialty, confidence };
  } catch {
    return { specialty: 'general', confidence: 0.5 };
  }
}

function haversineKmFn(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = function searchHospitalsSkill({ z, supabase, patientLat, patientLon, haversineKm, triageContext }) {
  const _haversine = haversineKm || haversineKmFn;

  return {
    inputSchema: z.object({
      state: z.string().optional().describe('City or state the patient is in (fallback if GPS unavailable), e.g. Lagos, Abuja'),
      has_emergency: z.boolean().optional().describe('True if emergency capability is required'),
    }),
    execute: async ({ state, has_emergency }) => {
      try {
        const stateClean = String(state || '').trim();
        const hasCoords = patientLat != null && patientLon != null;
        const usePlaces = googlePlaces.isConfigured() && hasCoords;

        console.log(`[searchHospitals] state="${stateClean}" has_emergency=${has_emergency} coords=${hasCoords} places=${usePlaces}`);

        // ── Google Places path ─────────────────────────────────────────────
        if (usePlaces) {
          const latKey = bucket(patientLat);
          const lonKey = bucket(patientLon);
          const radiusM = DEFAULT_RADIUS_M;

          // 1. Check 24h cache
          let places;
          const { data: cached } = await supabase
            .from('hospital_places_cache')
            .select('results, cached_at')
            .eq('lat_key', latKey)
            .eq('lon_key', lonKey)
            .eq('radius_m', radiusM)
            .maybeSingle();

          if (cached && Date.now() - new Date(cached.cached_at).getTime() < CACHE_TTL_MS) {
            places = cached.results;
            console.log(`[searchHospitals] cache hit (${places.length} places)`);
          } else {
            places = await googlePlaces.searchNearbyHospitals({ lat: patientLat, lon: patientLon, radius: radiusM });
            console.log(`[searchHospitals] Places API returned ${places.length} results`);

            if (places.length === 0) {
              return { error: 'no_hospitals', message: 'No hospitals found nearby. Tell the patient to call emergency services (199 or 112) or search Google Maps.' };
            }

            // Upsert cache
            await supabase.from('hospital_places_cache').upsert(
              { lat_key: latKey, lon_key: lonKey, radius_m: radiusM, results: places, cached_at: new Date().toISOString() },
              { onConflict: 'lat_key,lon_key,radius_m' },
            );
          }

          // 2. Merge with hospitals table for is_onboarded + phone overrides
          const placeIds = places.map((p) => p.id).filter(Boolean);
          const { data: onboardedRows = [] } = await supabase
            .from('hospitals_directory')
            .select('place_id, id, is_onboarded, phone')
            .in('place_id', placeIds);

          const onboardedMap = Object.fromEntries((onboardedRows || []).map((r) => [r.place_id, r]));

          // 3. Specialty inference — batch check cache, infer missing
          const cutoff = new Date(Date.now() - SPECIALTY_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
          const { data: cachedSpecialties = [] } = await supabase
            .from('hospital_specialties')
            .select('place_id, specialty, confidence')
            .in('place_id', placeIds)
            .gte('inferred_at', cutoff);

          const specialtyMap = Object.fromEntries((cachedSpecialties || []).map((r) => [r.place_id, r]));

          // Infer missing specialties
          if (process.env.OPENAI_API_KEY) {
            const missing = places.filter((p) => p.id && !specialtyMap[p.id]);
            await Promise.allSettled(
              missing.map(async (place) => {
                const inferred = await inferSpecialty(place, openaiJsonCall);
                specialtyMap[place.id] = inferred;
                await supabase.from('hospital_specialties').upsert(
                  { place_id: place.id, specialty: inferred.specialty, confidence: inferred.confidence, inferred_at: new Date().toISOString() },
                  { onConflict: 'place_id' },
                );
              }),
            );
          }

          // 4. Build result objects
          const preferred = preferredSpecialtyFromTriage(triageContext);
          const results = places.map((place) => {
            const onboarded = onboardedMap[place.id];
            const specialtyInfo = specialtyMap[place.id] || { specialty: 'general', confidence: 0.5 };
            const lat2 = place.location?.latitude;
            const lon2 = place.location?.longitude;
            const distanceKm = lat2 != null && lon2 != null
              ? Math.round(_haversine(patientLat, patientLon, lat2, lon2) * 10) / 10
              : null;

            const phone = onboarded?.phone || place.nationalPhoneNumber || place.internationalPhoneNumber || null;
            const contact = phone || place.googleMapsUri || null;

            return {
              id: onboarded?.id || place.id,
              place_id: place.id,
              name: place.displayName?.text || 'Hospital',
              address: place.formattedAddress || null,
              phone: contact,
              is_onboarded: onboarded?.is_onboarded ?? false,
              specialty: specialtyInfo.specialty,
              specialty_confidence: specialtyInfo.confidence,
              distance_km: distanceKm,
              _specialtyMatch: preferred ? specialtyInfo.specialty === preferred : false,
            };
          });

          // 5. Rank: specialty match first, then distance
          results.sort((a, b) => {
            if (a._specialtyMatch !== b._specialtyMatch) return a._specialtyMatch ? -1 : 1;
            return (a.distance_km ?? 99999) - (b.distance_km ?? 99999);
          });

          const top = results.slice(0, 5).map(({ _specialtyMatch, ...r }) => r);
          console.log(`[searchHospitals] top: ${top.map((h) => `${h.name} ${h.distance_km}km [${h.specialty}]`).join(' | ')}`);
          return { hospitals: top };
        }

        // ── Supabase fallback path (no Places key or no GPS) ──────────────
        let q = supabase
          .from('hospitals_directory')
          .select('id,name,city,state,country,type,tier,specialties,phone,website,has_emergency,is_onboarded,lat,lon')
          .eq('is_active', true);
        if (has_emergency) q = q.eq('has_emergency', true);

        const { data: all, error } = await q.limit(200);
        if (error) return { error: 'db_error', message: error.message };
        if (!all || all.length === 0) {
          return { error: 'no_hospitals', message: 'No hospitals found in the network. Tell the patient to call emergency services (199 or 112) or search Google Maps for nearby clinics.' };
        }

        let ranked;
        if (hasCoords) {
          ranked = all
            .map((h) => ({
              ...h,
              distance_km: (h.lat != null && h.lon != null)
                ? Math.round(_haversine(patientLat, patientLon, h.lat, h.lon))
                : 99999,
            }))
            .sort((a, b) => a.distance_km - b.distance_km)
            .slice(0, 3)
            .map(({ lat: _lat, lon: _lon, ...rest }) => rest);
        } else if (stateClean) {
          const matches = all.filter((h) => h.state?.toLowerCase().includes(stateClean.toLowerCase()));
          const pool = matches.length > 0 ? matches : all;
          ranked = pool.slice(0, 3).map(({ lat: _lat, lon: _lon, ...rest }) => rest);
          if (matches.length === 0) {
            return { hospitals: ranked, note: `No hospitals found near "${stateClean}" — showing available hospitals in the network instead. Inform the patient.` };
          }
        } else {
          return { error: 'no_location', message: 'Location is required. Ask the patient for their city or state before searching.' };
        }

        return { hospitals: ranked };
      } catch (e) {
        return { error: 'unexpected', message: String(e?.message ?? e) };
      }
    },
  };
};
