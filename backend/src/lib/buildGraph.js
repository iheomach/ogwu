const { StateGraph, END } = require('@langchain/langgraph');
const { SystemMessage, AIMessage } = require('@langchain/core/messages');
const { ChatOpenAI } = require('@langchain/openai');
const { AgentState } = require('./agentState');
const { buildToolDispatcher, SKILL_NAMES } = require('./buildToolNodes');
const { loadLangGraphSkills } = require('./loadLangGraphSkills');
const { checkWithLlamaGuard, INPUT_SAFE_FALLBACK } = require('./llamaGuard');
const { notifyEmergency } = require('./notify');

// ── Input guard node ──────────────────────────────────────────────────────────
// Runs before the agent. Blocks harmful user messages via Llama Guard.

async function inputGuardNode(state) {
  const lastHuman = [...state.messages].reverse().find((m) => m._getType?.() === 'human');
  if (!lastHuman) return {};

  const content = typeof lastHuman.content === 'string'
    ? lastHuman.content
    : Array.isArray(lastHuman.content)
      ? lastHuman.content.filter((p) => p.type === 'text').map((p) => p.text).join('')
      : '';

  if (!content.trim()) return {};

  const result = await checkWithLlamaGuard([{ role: 'user', content }], 'User');
  if (!result.safe) {
    console.warn(`[guard] input blocked — category: ${result.category}`);
    return { messages: [new AIMessage(INPUT_SAFE_FALLBACK)], input_blocked: true };
  }
  return {};
}

function routeFromInputGuard(state) {
  return state.input_blocked ? END : 'agent';
}

// ── Escalate node ─────────────────────────────────────────────────────────────
// Triggered when urgency = emergency. Inserts an emergency_alerts row so the
// provider's admin dashboard receives a Supabase Realtime push immediately.
async function escalateNode(state) {
  const patientId = state.patient_id;
  const reason = state.tool_results?.flagEmergency?.reason ?? null;
  console.warn(`[agent] EMERGENCY escalated — patient ${patientId}`);
  await notifyEmergency({ patientId, reason });
  return {};
}

// ── Routing ───────────────────────────────────────────────────────────────────

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
    .addNode('escalate', escalateNode);

  graph.addEdge('__start__', 'input_guard');
  graph.addConditionalEdges('input_guard', routeFromInputGuard, ['agent', END]);
  graph.addConditionalEdges('agent', routeFromAgent, ['tools', 'escalate', END]);
  graph.addConditionalEdges('tools', routeFromTool, ['escalate', 'agent']);
  graph.addEdge('escalate', END);

  return graph.compile({ checkpointer: checkpointer ?? undefined });
}

module.exports = { buildGraph };
