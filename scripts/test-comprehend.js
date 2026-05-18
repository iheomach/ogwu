#!/usr/bin/env node
'use strict';

/**
 * Smoke tests for AWS Comprehend Medical ICD-10 entity extraction.
 *
 * Test 1 — live call: verifies InferICD10CM returns entities and flags
 *   emergency/urgent signals for realistic clinical text. Requires AWS creds.
 *
 * Test 2 — no-op fallback: verifies the module returns an empty result when
 *   AWS_ACCESS_KEY_ID is absent (local dev / Supabase-only path).
 *
 * Exit 0 = both tests passed. Exit 1 = one or more failed.
 * Run from repo root: node scripts/test-comprehend.js
 * Run from backend/: node ../scripts/test-comprehend.js
 */

const path = require('path');

// Resolve the module relative to this script regardless of cwd.
const comprehendPath = path.resolve(__dirname, '../backend/src/lib/comprehendMedical');

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

let passed = 0;
let failed = 0;

function ok(label)   { console.log(`  ${GREEN}✓${RESET} ${label}`); passed++; }
function fail(label) { console.log(`  ${RED}✗${RESET} ${label}`);   failed++; }
function info(label) { console.log(`  ${YELLOW}i${RESET} ${label}`); }

// ---------------------------------------------------------------------------
// Test 1 — live AWS call
// ---------------------------------------------------------------------------
async function testLiveCall() {
  console.log(`\n${BOLD}Test 1: Live AWS InferICD10CM call${RESET}`);

  const { extractEntitiesFromAnswers, isConfigured } = require(comprehendPath);

  if (!isConfigured()) {
    fail('AWS_ACCESS_KEY_ID or AWS_REGION not set — cannot run live test');
    return;
  }
  info(`AWS_REGION=${process.env.AWS_REGION}`);

  // Explicit "heart attack" language maps to I21.* in Comprehend Medical.
  // Comprehend codes stated conditions, not inferred diagnoses, so symptom-only
  // text (e.g. "chest pain") maps to R07.* which is caught by URGENT_PREFIXES.
  const answers = [
    { q: 'What is your main symptom?',  a: 'I think I am having a heart attack' },
    { q: 'How long have you had this?', a: 'started about 30 minutes ago, crushing pain in my chest' },
    { q: 'Any other symptoms?',         a: 'I am sweating heavily and feel short of breath' },
  ];

  let result;
  try {
    result = await extractEntitiesFromAnswers(answers);
  } catch (err) {
    fail(`extractEntitiesFromAnswers threw: ${err.message}`);
    return;
  }

  if (result.entities.length > 0) {
    ok(`returned ${result.entities.length} entity/entities above score threshold`);
  } else {
    fail('returned 0 entities — check MIN_SCORE or AWS credentials');
  }

  if (result.emergencySignaled) {
    ok('emergencySignaled=true (ICD-10 EMERGENCY_PREFIXES matched)');
  } else {
    fail('emergencySignaled=false — chest pain / MI prefix not matched; inspect entity codes below');
  }

  if (result.entities.length > 0) {
    info('Top entities:');
    result.entities.slice(0, 5).forEach((e) => {
      info(`  "${e.text}" → ${e.icd10Code ?? 'no code'} (${e.icd10Description ?? '—'}) score=${e.score}`);
    });
  }
}

// ---------------------------------------------------------------------------
// Test 2 — no-op fallback (simulate unconfigured environment)
// ---------------------------------------------------------------------------
async function testNoOpFallback() {
  console.log(`\n${BOLD}Test 2: No-op fallback (AWS creds absent)${RESET}`);

  // Stash and clear the key so isConfigured() returns false.
  const savedKey    = process.env.AWS_ACCESS_KEY_ID;
  const savedRegion = process.env.AWS_REGION;
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_REGION;

  // Re-require with a busted cache key so the module re-evaluates isConfigured().
  // comprehendMedical.js reads env vars at call time (inside isConfigured/getClient),
  // so clearing env vars is sufficient — no cache invalidation needed.
  const { extractEntitiesFromAnswers, isConfigured } = require(comprehendPath);

  try {
    if (isConfigured()) {
      fail('isConfigured() returned true despite missing AWS_ACCESS_KEY_ID — check the function');
      return;
    }
    ok('isConfigured() correctly returns false when AWS_ACCESS_KEY_ID is unset');

    const result = await extractEntitiesFromAnswers([
      { q: 'symptom', a: 'chest pain' },
    ]);

    if (!Array.isArray(result.entities) || result.entities.length !== 0) {
      fail(`expected empty entities array, got: ${JSON.stringify(result.entities)}`);
    } else {
      ok('entities is an empty array');
    }

    if (result.emergencySignaled === false && result.urgentSignaled === false) {
      ok('emergencySignaled=false, urgentSignaled=false');
    } else {
      fail(`expected both signals false, got emergency=${result.emergencySignaled} urgent=${result.urgentSignaled}`);
    }
  } finally {
    // Restore env vars so anything running after this still has credentials.
    if (savedKey)    process.env.AWS_ACCESS_KEY_ID = savedKey;
    if (savedRegion) process.env.AWS_REGION        = savedRegion;
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
(async () => {
  console.log(`${BOLD}=== Comprehend Medical smoke tests ===${RESET}`);

  await testLiveCall();
  await testNoOpFallback();

  console.log(`\n${BOLD}Results: ${GREEN}${passed} passed${RESET}${BOLD}, ${failed > 0 ? RED : ''}${failed} failed${RESET}`);
  process.exit(failed > 0 ? 1 : 0);
})();
