#!/usr/bin/env node
// ci trigger
'use strict';

/**
 * Eval runner — feeds test cases through the agent, judges each result,
 * reports pass rates by category, and exits non-zero if below PASS_THRESHOLD.
 *
 * Usage:
 *   node evals/runner/index.js [--cases path/to/test-cases.json] [--category urgency_classification]
 *
 * Env vars:
 *   OPENAI_API_KEY      — required (agent + judge)
 *   OPENAI_MODEL        — optional (agent model, default gpt-4o-mini)
 *   PASS_THRESHOLD      — optional float 0–1 (default 0.75)
 *   EVAL_CONCURRENCY    — optional int (default 3, parallel cases per batch)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../backend/.env') });

const fs = require('fs');
const path = require('path');
const { runTestCase } = require('./harness');
const { judge } = require('./judge');

const CASES_PATH = argFlag('--cases') ?? path.join(__dirname, '../test-cases.json');
const FILTER_CATEGORY = argFlag('--category') ?? null;
const PASS_THRESHOLD = parseFloat(process.env.PASS_THRESHOLD ?? '0.75');
const CONCURRENCY = parseInt(process.env.EVAL_CONCURRENCY ?? '3', 10);

// ── Helpers ───────────────────────────────────────────────────────────────────

function argFlag(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

async function runBatch(cases, runner) {
  const results = [];
  for (let i = 0; i < cases.length; i += CONCURRENCY) {
    const batch = cases.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(runner));
    results.push(...batchResults);
  }
  return results;
}

function formatPercent(n, d) {
  if (d === 0) return 'n/a';
  return `${Math.round((n / d) * 100)}%`;
}

function categoryLabel(cat) {
  const labels = {
    urgency_classification: 'Urgency Classification',
    tool_selection:         'Tool Selection',
    drug_interaction:       'Drug Interaction',
    refusal_boundary:       'Refusal / Boundary',
  };
  return labels[cat] ?? cat;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY is not set');
    process.exit(1);
  }

  if (!fs.existsSync(CASES_PATH)) {
    console.error(`ERROR: Test cases file not found: ${CASES_PATH}`);
    console.error('Generate test cases first: see evals/generate-test-cases.md');
    process.exit(1);
  }

  let allCases;
  try {
    allCases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'));
  } catch (err) {
    console.error(`ERROR: Could not parse ${CASES_PATH}: ${err.message}`);
    process.exit(1);
  }

  const cases = FILTER_CATEGORY
    ? allCases.filter((c) => c.category === FILTER_CATEGORY)
    : allCases;

  if (cases.length === 0) {
    console.error(`ERROR: No test cases found${FILTER_CATEGORY ? ` for category "${FILTER_CATEGORY}"` : ''}`);
    process.exit(1);
  }

  console.log(`\nOgwu Eval Runner`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`Cases: ${cases.length}${FILTER_CATEGORY ? ` (filtered: ${FILTER_CATEGORY})` : ''}`);
  console.log(`Pass threshold: ${Math.round(PASS_THRESHOLD * 100)}%`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`${'─'.repeat(60)}\n`);

  const resultLog = [];

  const runOne = async (tc) => {
    process.stdout.write(`  [${tc.id}] running...`);

    let actual;
    let verdict;

    try {
      actual = await runTestCase(tc);
    } catch (err) {
      actual = { text: '', tools_called: [], urgency: null, interrupted: false, error: err.message };
    }

    try {
      verdict = await judge(tc, actual);
    } catch (err) {
      verdict = { pass: false, score: 0, reasoning: `Judge error: ${err.message}` };
    }

    const status = verdict.pass ? '✓ PASS' : '✗ FAIL';
    process.stdout.write(`\r  [${tc.id}] ${status}  (score ${verdict.score.toFixed(2)}) — ${verdict.reasoning.slice(0, 80)}\n`);

    return { tc, actual, verdict };
  };

  const results = await runBatch(cases, runOne);

  // ── Per-category summary ──────────────────────────────────────────────────

  const categories = [...new Set(cases.map((c) => c.category))];
  const byCategory = {};
  for (const cat of categories) {
    byCategory[cat] = results.filter((r) => r.tc.category === cat);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log('Results by category\n');

  let totalPass = 0;
  let totalFail = 0;

  for (const cat of categories) {
    const catResults = byCategory[cat];
    const pass = catResults.filter((r) => r.verdict.pass).length;
    const fail = catResults.length - pass;
    const pct = formatPercent(pass, catResults.length);
    totalPass += pass;
    totalFail += fail;

    console.log(`  ${categoryLabel(cat)}`);
    console.log(`    Pass ${pass}/${catResults.length} (${pct})`);

    // Break down by difficulty
    for (const diff of ['easy', 'medium', 'hard']) {
      const sub = catResults.filter((r) => r.tc.difficulty === diff);
      if (sub.length === 0) continue;
      const subPass = sub.filter((r) => r.verdict.pass).length;
      console.log(`      ${diff}: ${subPass}/${sub.length}`);
    }
    console.log('');
  }

  const total = totalPass + totalFail;
  const overallPct = totalPass / total;

  console.log(`${'─'.repeat(60)}`);
  console.log(`Overall: ${totalPass}/${total} (${formatPercent(totalPass, total)})`);
  console.log(`Threshold: ${Math.round(PASS_THRESHOLD * 100)}%`);

  // ── Failures detail ───────────────────────────────────────────────────────

  const failures = results.filter((r) => !r.verdict.pass);
  if (failures.length > 0) {
    console.log(`\nFailed cases:`);
    for (const { tc, actual, verdict } of failures) {
      console.log(`\n  [${tc.id}] ${tc.difficulty} — ${tc.eval_criteria}`);
      console.log(`    Tools called: ${actual.tools_called.join(', ') || 'none'}`);
      console.log(`    Urgency: ${actual.urgency ?? 'not set'}`);
      if (actual.error) console.log(`    Error: ${actual.error}`);
      console.log(`    Judge: ${verdict.reasoning}`);
    }
  }

  // ── Write results JSON ────────────────────────────────────────────────────

  const resultsDir = path.join(__dirname, '../results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outPath = path.join(resultsDir, `run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        overall: { pass: totalPass, fail: totalFail, total, pass_rate: overallPct },
        threshold: PASS_THRESHOLD,
        passed: overallPct >= PASS_THRESHOLD,
        by_category: Object.fromEntries(
          categories.map((cat) => {
            const catResults = byCategory[cat];
            const pass = catResults.filter((r) => r.verdict.pass).length;
            return [cat, { pass, total: catResults.length, pass_rate: pass / catResults.length }];
          }),
        ),
        cases: results.map(({ tc, actual, verdict }) => ({
          id: tc.id,
          category: tc.category,
          difficulty: tc.difficulty,
          pass: verdict.pass,
          score: verdict.score,
          reasoning: verdict.reasoning,
          tools_called: actual.tools_called,
          urgency: actual.urgency,
          error: actual.error,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\nResults written to: ${outPath}`);

  // ── Exit code ─────────────────────────────────────────────────────────────

  if (overallPct < PASS_THRESHOLD) {
    console.log(`\nFAILED: pass rate ${formatPercent(totalPass, total)} is below threshold ${Math.round(PASS_THRESHOLD * 100)}%\n`);
    process.exit(1);
  }

  console.log(`\nPASSED\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
