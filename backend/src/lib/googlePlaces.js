'use strict';

/**
 * Google Places API (New) — Nearby Search for hospitals.
 *
 * Uses the v1 Places API endpoint (places.googleapis.com).
 * No-op (returns []) when GOOGLE_PLACES_API_KEY is unset.
 */

const NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const DEFAULT_RADIUS_M = 5000;

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.location',
  'places.types',
  'places.editorialSummary',
  'places.googleMapsUri',
  'places.rating',
  'places.reviews',
].join(',');

function isConfigured() {
  return !!process.env.GOOGLE_PLACES_API_KEY;
}

async function searchNearbyHospitals({ lat, lon, radius = DEFAULT_RADIUS_M }) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return [];

  const body = {
    includedTypes: ['hospital'],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lon },
        radius,
      },
    },
  };

  const res = await fetch(NEARBY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places API ${res.status}: ${text}`);
  }

  const { places = [] } = await res.json();
  return places;
}

async function geocodeCity(cityString) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !cityString) return null;

  const query = encodeURIComponent(`${cityString.trim()}, Nigeria`);
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${key}`,
  );
  if (!res.ok) throw new Error(`Geocoding API ${res.status}`);

  const { status, results } = await res.json();
  if (status !== 'OK' || !results?.length) return null;

  const { lat, lng } = results[0].geometry.location;
  return { lat, lon: lng };
}

module.exports = { isConfigured, searchNearbyHospitals, geocodeCity, DEFAULT_RADIUS_M };
