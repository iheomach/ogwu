'use strict';

/**
 * Eval harness — runs a single test case through the live agent graph
 * (no checkpointer, no HTTP server) and returns what the agent actually did.
 *
 * Returns:
 *   {
 *     text: string,             // final assistant text
 *     tools_called: string[],   // tool names in call order
 *     urgency: string|null,     // final urgency from graph state
 *     interrupted: boolean,     // true if bookAppointment paused for HITL
 *     error: string|null,
 *   }
 */

const path = require('path');
const { HumanMessage } = require('@langchain/core/messages');
const { buildGraph } = require(path.join(__dirname, '../../backend/src/lib/buildGraph'));
const { buildSystemPrompt } = require(path.join(__dirname, '../../backend/src/lib/buildSystemPrompt'));
const { buildStubSkillCtx } = require('./stubs');

const THREAD_COUNTER = { n: 0 };

async function runTestCase(testCase) {
  const input = testCase.input;
  const patientProfile = input.patient_profile ?? {};

  const skillCtx = buildStubSkillCtx({
    biological_sex: patientProfile.sex ?? undefined,
    dob: patientProfile.age ? ageToApproximateDob(patientProfile.age) : undefined,
    allergies: patientProfile.current_medications ? '' : '',
    known_conditions: Array.isArray(patientProfile.known_conditions)
      ? patientProfile.known_conditions.join(', ')
      : '',
  });

  const systemPrompt = buildSystemPrompt({
    ...skillCtx.profile,
    liveLocation: 'Lagos, Nigeria',
  });

  // No checkpointer — each eval run is stateless
  const agent = buildGraph(skillCtx, systemPrompt, null);

  const threadId = `eval-${Date.now()}-${++THREAD_COUNTER.n}`;
  const config = { configurable: { thread_id: threadId }, recursionLimit: 20 };

  // Build message list — include conversation_history for multi-turn cases
  const history = Array.isArray(input.conversation_history) ? input.conversation_history : [];
  const allMessages = [
    ...history.map((m) =>
      m.role === 'user'
        ? new HumanMessage(m.content)
        : new (require('@langchain/core/messages').AIMessage)(m.content)
    ),
    new HumanMessage(input.user_message),
  ];

  const toolsCalled = [];
  let fullText = '';
  let interrupted = false;
  let urgency = null;

  try {
    const stream = agent.streamEvents(
      { messages: allMessages },
      { version: 'v2', ...config },
    );

    for await (const event of stream) {
      const { event: eventName, name, data } = event;

      if (eventName === 'on_chat_model_stream') {
        const content = data?.chunk?.content;
        if (typeof content === 'string') fullText += content;
        else if (Array.isArray(content)) {
          for (const p of content) if (p.type === 'text') fullText += p.text ?? '';
        }
      }

      if (eventName === 'on_chain_start') {
        const SKILL_NAMES = require(path.join(__dirname, '../../backend/src/lib/buildToolNodes')).SKILL_NAMES;
        if (SKILL_NAMES.includes(name) && !toolsCalled.includes(name)) {
          toolsCalled.push(name);
        }
      }

      if (eventName === 'on_chain_end') {
        const output = data?.output;
        if (output?.urgency) urgency = output.urgency;
      }
    }
  } catch (err) {
    // LangGraph throws GraphInterrupt when bookAppointment hits interrupt()
    if (err?.name === 'GraphInterrupt' || err?.constructor?.name === 'GraphInterrupt') {
      interrupted = true;
      if (!toolsCalled.includes('bookAppointment')) toolsCalled.push('bookAppointment');
    } else {
      return {
        text: fullText,
        tools_called: toolsCalled,
        urgency: null,
        interrupted: false,
        error: err?.message ?? String(err),
      };
    }
  }

  return {
    text: fullText.trim(),
    tools_called: toolsCalled,
    urgency,
    interrupted,
    error: null,
  };
}

function ageToApproximateDob(age) {
  const year = new Date().getFullYear() - age;
  return `${year}-06-01`;
}

module.exports = { runTestCase };
