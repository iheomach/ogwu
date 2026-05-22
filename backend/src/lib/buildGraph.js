const { StateGraph, END } = require('@langchain/langgraph');
const { SystemMessage, AIMessage } = require('@langchain/core/messages');
const { ChatOpenAI } = require('@langchain/openai');
const { AgentState } = require('./agentState');
const { buildToolDispatcher, SKILL_NAMES } = require('./buildToolNodes');
const { loadLangGraphSkills } = require('./loadLangGraphSkills');
const { checkWithLlamaGuard, INPUT_SAFE_FALLBACK } = require('./llamaGuard');
const { notifyEmergency: _notifyEmergency } = require('./notify');

// ── Input guard node ──────────────────────────────────────────────────────────
// Runs before the agent. Blocks harmful user messages via Llama Guard.

async function inputGuardNode(state) {
  const lastHuman = [...state.messages].reverse().find((m) => m._getType?.() === 'human');
  // Reset per-turn transient state so prior emergency flags don't persist into a new turn.
  if (!lastHuman) return { urgency: null, input_blocked: false };

  const content = typeof lastHuman.content === 'string'
    ? lastHuman.content
    : Array.isArray(lastHuman.content)
      ? lastHuman.content.filter((p) => p.type === 'text').map((p) => p.text).join('')
      : '';

  if (!content.trim()) return { urgency: null, input_blocked: false };

  const result = await checkWithLlamaGuard([{ role: 'user', content }], 'User');
  if (!result.safe) {
    console.warn(`[guard] input blocked — category: ${result.category}`);
    return { messages: [new AIMessage(INPUT_SAFE_FALLBACK)], input_blocked: true, urgency: null };
  }
  return { urgency: null, input_blocked: false };
}

function routeFromInputGuard(state) {
  return state.input_blocked ? END : 'agent';
}

// ── Escalate node ─────────────────────────────────────────────────────────────
// Triggered when urgency = emergency. Inserts an emergency_alerts row so the
// provider's admin dashboard receives a Supabase Realtime push immediately.
function makeEscalateNode(skillCtx) {
  const notifyEmergency = skillCtx.notifyEmergency ?? _notifyEmergency;
  return async function escalateNode(state) {
    const patientId = state.patient_id;
    const reason = state.tool_results?.flagEmergency?.reason ?? null;
    console.warn(`[agent] EMERGENCY escalated — patient ${patientId}`);
    await notifyEmergency({ patientId, reason });
    // Reset urgency so the agent gets one more turn to respond and the
    // routing loop doesn't re-enter escalate on the next tools call.
    return { urgency: null };
  };
}

// ── Failure escalation node ───────────────────────────────────────────────────
// Triggered after 3 cumulative tool failures in a session. Logs to
// session_escalations and sends the patient a plain-language message.

function makeFailureEscalateNode(skillCtx) {
  return async function failureEscalateNode(state) {
    const patientId = state.patient_id;
    const lastErrors = Object.entries(state.tool_results ?? {})
      .filter(([, v]) => v?.error || v?.ok === false)
      .map(([name, v]) => `${name}: ${v?.error ?? v?.message ?? 'unknown'}`)
      .join('; ') || 'repeated tool failures';

    console.warn(`[agent] failure escalation — patient ${patientId} — ${lastErrors}`);

    // Log to session_escalations (fire-and-forget)
    try {
      await skillCtx.supabase.from('session_escalations').insert({
        patient_id: patientId ?? null,
        failure_count: state.failure_count ?? 3,
        last_error: lastErrors.slice(0, 500),
        message_context: (state.messages ?? []).slice(-6).map((m) => ({
          role: m._getType?.() ?? 'unknown',
          content: typeof m.content === 'string'
            ? m.content.slice(0, 300)
            : Array.isArray(m.content)
              ? m.content.filter((p) => p.type === 'text').map((p) => p.text).join('').slice(0, 300)
              : '',
        })),
      });
    } catch (e) {
      console.warn('[session_escalations] write failed:', e?.message);
    }

    const msg = new AIMessage(
      'I\'ve run into repeated issues completing your request, and I want to make sure you get the help you need. ' +
      'I\'ve flagged this for our team. In the meantime, please call emergency services at 199 or 112 if this is urgent, ' +
      'or search Google Maps for hospitals near you. I\'m sorry for the difficulty.'
    );

    return { messages: [msg], failure_count: 0 };
  };
}

// ── Routing ───────────────────────────────────────────────────────────────────

const FAILURE_ESCALATION_THRESHOLD = 3;

function routeFromAgent(state) {
  if (state.urgency === 'emergency') return 'escalate';

  const last = state.messages[state.messages.length - 1];
  const toolCalls = last?.tool_calls ?? [];
  if (toolCalls.length === 0) return END;

  const hasSkillCall = toolCalls.some((tc) => SKILL_NAMES.includes(tc.name));
  return hasSkillCall ? 'tools' : END;
}

function routeFromTool(state) {
  if (state.urgency === 'emergency') return 'escalate';
  if ((state.failure_count ?? 0) >= FAILURE_ESCALATION_THRESHOLD) return 'failure_escalate';
  return 'agent';
}

// ── Graph factory ─────────────────────────────────────────────────────────────

function buildGraph(skillCtx, systemPrompt, checkpointer = null) {
  const llmWithTools = new ChatOpenAI({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    streaming: true,
  }).bindTools(loadLangGraphSkills(skillCtx));

  async function agentNode(state) {
    const messages = systemPrompt
      ? [new SystemMessage(systemPrompt), ...state.messages]
      : state.messages;
    const response = await llmWithTools.invoke(messages);
    return {
      messages: [response],
      patient_id: state.patient_id ?? skillCtx.profile?.id ?? null,
    };
  }

  const graph = new StateGraph(AgentState)
    .addNode('input_guard', inputGuardNode)
    .addNode('agent', agentNode)
    .addNode('tools', buildToolDispatcher(skillCtx))
    .addNode('escalate', makeEscalateNode(skillCtx))
    .addNode('failure_escalate', makeFailureEscalateNode(skillCtx));

  graph.addEdge('__start__', 'input_guard');
  graph.addConditionalEdges('input_guard', routeFromInputGuard, ['agent', END]);
  graph.addConditionalEdges('agent', routeFromAgent, ['tools', 'escalate', END]);
  graph.addConditionalEdges('tools', routeFromTool, ['escalate', 'failure_escalate', 'agent']);
  graph.addEdge('escalate', 'agent');
  graph.addEdge('failure_escalate', END);

  return graph.compile({ checkpointer: checkpointer ?? undefined });
}

module.exports = { buildGraph };
