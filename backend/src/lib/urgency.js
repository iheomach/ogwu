'use strict';

const z = require('zod');

// Triage flow: computeUrgency() + triage_intakes, consult_threads, encounters
const TRIAGE_URGENCY = z.enum(['emergency', 'urgent', 'soon', 'routine']);

// Agent flow: createConsult tool + consults table
const AGENT_URGENCY = z.enum(['emergency', 'urgent', 'routine', 'self_care']);

/**
 * Validates a triage urgency value. Falls back to 'routine' on any invalid input
 * so a bad value never blocks a DB write or exposes an unhandled error to the patient.
 */
function parseTriageUrgency(value) {
  const result = TRIAGE_URGENCY.safeParse(value);
  if (!result.success) {
    console.warn(`[urgency] invalid triage urgency "${value}" — defaulting to "routine"`);
    return 'routine';
  }
  return result.data;
}

/**
 * Validates an agent urgency value. Falls back to 'routine' on any invalid input.
 */
function parseAgentUrgency(value) {
  const result = AGENT_URGENCY.safeParse(value);
  if (!result.success) {
    console.warn(`[urgency] invalid agent urgency "${value}" — defaulting to "routine"`);
    return 'routine';
  }
  return result.data;
}

module.exports = { TRIAGE_URGENCY, AGENT_URGENCY, parseTriageUrgency, parseAgentUrgency };
