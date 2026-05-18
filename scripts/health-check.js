#!/usr/bin/env node
'use strict';

/**
 * API health check — verifies connectivity and auth for every external
 * service the app depends on.
 *
 * Designed to be cheap: no LLM inference, no data writes, no billable
 * operations. SerpAPI account endpoint, OpenAI/Groq model lists, Supabase
 * REST ping, Resend domain list, HealthLake FHIR capability statement.
 *
 * Exit 0 = all required checks passed. Exit 1 = one or more failed.
 */

const aws4 = require('aws4');

const TIMEOUT_MS = 12_000;

// ANSI colours work in GitHub Actions logs.
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

async function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)),
  ]);
}

// Runs a check function, prints a coloured result line, returns true/false/null (null = skipped).
async function run(label, required, fn) {
  try {
    const detail = await withTimeout(fn(), TIMEOUT_MS);
    console.log(`${GREEN}✓${RESET} ${label}: ${detail}`);
    return true;
  } catch (err) {
    if (err.message === 'skipped') {
      console.log(`${YELLOW}~${RESET} ${label}: not configured (skipped)`);
      return null;
    }
    const tag = required ? `${RED}✗${RESET}` : `${YELLOW}!${RESET}`;
    console.log(`${tag} ${label}: ${err.message}`);
    return required ? false : null;
  }
}

// ── Checks ────────────────────────────────────────────────────────────────────

async function checkOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (res.status === 401) throw new Error('invalid API key (401)');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return `${data?.data?.length ?? 0} models available`;
}

async function checkGroq() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (res.status === 401) throw new Error('invalid API key (401)');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return `${data?.data?.length ?? 0} models available`;
}

async function checkSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  const res = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (res.status === 401) throw new Error('invalid service role key (401)');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return 'reachable';
}

async function checkSerpAPI() {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error('SERPAPI_API_KEY not set');
  const res = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(key)}`);
  if (res.status === 401 || res.status === 403) throw new Error('invalid API key');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const remaining = data?.plan_searches_left ?? data?.searches_per_month ?? '?';
  return `active — ${remaining} searches remaining this month`;
}

async function checkResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not set');
  const res = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error('invalid API key');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const domains = (data?.data ?? []).map((d) => d.name).join(', ') || 'none';
  return `${data?.data?.length ?? 0} domain(s): ${domains}`;
}

async function checkHealthLake() {
  const datastoreId = process.env.AWS_HEALTHLAKE_DATASTORE_ID;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!datastoreId || !accessKeyId || !secretAccessKey) throw new Error('skipped');

  const host = `healthlake.${region}.amazonaws.com`;
  const path = `/datastore/${datastoreId}/r4/metadata`;
  const opts = {
    service: 'healthlake',
    region,
    method: 'GET',
    host,
    path,
    headers: { Accept: 'application/fhir+json' },
  };
  aws4.sign(opts, { accessKeyId, secretAccessKey });

  const res = await fetch(`https://${host}${path}`, { method: 'GET', headers: opts.headers });
  if (res.status === 401 || res.status === 403) throw new Error('IAM auth failed');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return `FHIR ${data?.fhirVersion ?? '?'} capability statement OK`;
}

async function checkGoogleCalendar() {
  // Requires a refresh token stored in Supabase. Fetch it here and attempt
  // a token refresh to verify credentials are still valid.
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret) throw new Error('skipped');

  // Read refresh token from Supabase.
  const tokenRes = await fetch(
    `${supabaseUrl}/rest/v1/integration_tokens?provider=eq.google_calendar&select=refresh_token&limit=1`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Accept: 'application/json' } },
  );
  if (!tokenRes.ok) throw new Error(`Supabase read failed (${tokenRes.status})`);
  const rows = await tokenRes.json();
  const refreshToken = rows?.[0]?.refresh_token;
  if (!refreshToken) throw new Error('no refresh token stored — calendar not connected');

  // Attempt token refresh (doesn't burn quota, just proves credentials work).
  const gRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!gRes.ok) {
    const body = await gRes.json().catch(() => ({}));
    throw new Error(body?.error_description ?? body?.error ?? `HTTP ${gRes.status}`);
  }
  return 'token refresh OK';
}

function checkVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('skipped');
  // Uncompressed EC public key = 65 bytes → ~87 base64url chars
  if (pub.length < 80) throw new Error(`VAPID_PUBLIC_KEY too short (${pub.length} chars — may be malformed)`);
  if (priv.length < 40) throw new Error(`VAPID_PRIVATE_KEY too short (${priv.length} chars — may be malformed)`);
  return `keys present (pub ${pub.length} chars, priv ${priv.length} chars)`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Ogwu API health check\n');

  // required=true → failure exits with code 1
  // required=false → failure is a warning only
  const checks = await Promise.all([
    run('OpenAI',            true,  checkOpenAI),
    run('Groq (LlamaGuard)', true,  checkGroq),
    run('Supabase',          true,  checkSupabase),
    run('SerpAPI',           true,  checkSerpAPI),
    run('Resend',            true,  checkResend),
    run('AWS HealthLake',    false, checkHealthLake),
    run('Google Calendar',   false, checkGoogleCalendar),
    run('VAPID push keys',   false, () => Promise.resolve(checkVapid())),
  ]);

  const required = [true, true, true, true, true, false, false, false];
  const failed = checks.filter((r, i) => r === false && required[i]).length;
  const warned = checks.filter((r, i) => r === false && !required[i]).length;
  const skipped = checks.filter((r) => r === null).length;
  const passed = checks.filter((r) => r === true).length;

  console.log(`\n${passed} passed, ${failed} failed, ${warned} warned, ${skipped} skipped`);

  if (failed > 0) {
    console.error(`\n${RED}Health check FAILED — ${failed} required service(s) unreachable.${RESET}`);
    process.exit(1);
  }
  console.log(`\n${GREEN}Health check passed.${RESET}`);
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
