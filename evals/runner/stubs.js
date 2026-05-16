'use strict';

/**
 * Stub skillCtx for the eval harness.
 *
 * Real skills receive a rich ctx (supabase client, Google Calendar, etc.).
 * In evals we don't want network I/O — we return canned data that is
 * realistic enough for the LLM to reason about but never hits external APIs.
 */

const z = require('zod');

// ── Stub supabase ─────────────────────────────────────────────────────────────

function makeSupabase() {
  return {
    from: (table) => makeQueryBuilder(table),
  };
}

function makeQueryBuilder(table) {
  const builder = {
    _table: table,
    select: () => builder,
    insert: () => builder,
    upsert: () => builder,
    update: () => builder,
    delete: () => builder,
    eq: () => builder,
    like: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => {
      const rows = defaultTableData(table);
      const row = Array.isArray(rows) ? (rows[0] ?? null) : rows;
      return { data: row, error: null };
    },
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve) =>
      resolve({
        data: defaultTableData(table),
        error: null,
      }),
  };
  return builder;
}

function defaultTableData(table) {
  if (table === 'hospitals_directory') {
    return [
      {
        id: 'hosp-001',
        name: 'Lagos General Hospital',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        type: 'government',
        tier: 'tertiary',
        specialties: ['emergency', 'general medicine'],
        phone: '+2341234567',
        website: null,
        has_emergency: true,
        is_onboarded: true,
        lat: 6.455,
        lon: 3.396,
        distance_km: 2,
      },
    ];
  }
  if (table === 'consults') {
    return [
      {
        id: 'cons-001',
        complaint: 'chest pain',
        urgency: 'emergency',
        care_pathway: 'emergency_referral',
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
    ];
  }
  return [];
}

// ── Stub fetchAvailableSlots ──────────────────────────────────────────────────

async function fetchAvailableSlots() {
  const base = new Date();
  base.setHours(base.getHours() + 2, 0, 0, 0);
  return [
    { starts_at_local: isoLocal(base, 0), display: 'Today, 2:00 PM', time_zone: 'Africa/Lagos', provider_time_zone: 'Africa/Lagos' },
    { starts_at_local: isoLocal(base, 2), display: 'Today, 4:00 PM', time_zone: 'Africa/Lagos', provider_time_zone: 'Africa/Lagos' },
  ];
}

function isoLocal(date, offsetHours) {
  const d = new Date(date.getTime() + offsetHours * 3600000);
  return d.toISOString().slice(0, 16);
}

// ── Haversine (real implementation — no I/O) ──────────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── safeText / normalizeUrgency (copied from agent.js) ────────────────────────

function safeText(s, maxLen) {
  const out = typeof s === 'string' ? s.trim() : '';
  if (!out) return '';
  return out.length > maxLen ? out.slice(0, maxLen) : out;
}

function normalizeUrgency(u) {
  const v = String(u || '').toLowerCase();
  if (['emergency', 'urgent', 'routine', 'self_care'].includes(v)) return v;
  return 'routine';
}

// ── Factory ───────────────────────────────────────────────────────────────────

function buildStubSkillCtx(patientProfile = {}) {
  return {
    z,
    supabase: makeSupabase(),
    profile: {
      id: 'eval-patient-001',
      first_name: 'Test',
      last_name: 'Patient',
      phone: '+2348000000000',
      allergies: '',
      known_conditions: '',
      biological_sex: 'female',
      dob: '1990-01-01',
      state: 'Lagos',
      ...patientProfile,
    },
    patientLat: 6.455,
    patientLon: 3.396,
    haversineKm,
    fetchAvailableSlots,
    getClinicCalendarAuth: async () => null,
    safeText,
    normalizeUrgency,
    patientTimeZone: 'Africa/Lagos',
  };
}

module.exports = { buildStubSkillCtx };
