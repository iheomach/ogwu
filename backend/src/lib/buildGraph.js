const { StateGraph, END } = require('@langchain/langgraph');
const { SystemMessage } = require('@langchain/core/messages');
const { ChatOpenAI } = require('@langchain/openai');
const { AgentState } = require('./agentState');
const { buildToolNodes, SKILL_NAMES } = require('./buildToolNodes');
const { loadLangGraphSkills } = require('./loadLangGraphSkills');

// ── Escalate node ─────────────────────────────────────────────────────────────
// Triggered when urgency = emergency. Placeholder for provider notification
// (push alert, paging, etc.) — wired to the future push notification feature.
async function escalateNode(state) {
  console.log(`[agent] EMERGENCY escalated — patient ${state.patient_id}`);
  return {};
}

// ── Routing ───────────────────────────────────────────────────────────────────

function routeFromAgent(state) {
  if (state.urgency === 'emergency') return 'escalate';

  const last = state.messages[state.messages.length - 1];
  const toolCalls = last?.tool_calls ?? [];
  if (toolCalls.length === 0) return END;

  const name = toolCalls[0]?.name;
  return SKILL_NAMES.includes(name) ? name : END;
}

function routeFromTool(state) {
  if (state.urgency === 'emergency') return 'escalate';
  return 'agent';
}

// ── Graph factory ─────────────────────────────────────────────────────────────

function buildGraph(skillCtx, systemPrompt, checkpointer = null) {
  const llmWithTools = new ChatOpenAI({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
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

  const toolNodes = buildToolNodes(skillCtx);

  const graph = new StateGraph(AgentState)
    .addNode('agent', agentNode)
    .addNode('escalate', escalateNode);

  for (const [name, node] of Object.entries(toolNodes)) {
    graph.addNode(name, node);
  }

  graph.addEdge('__start__', 'agent');

  graph.addConditionalEdges('agent', routeFromAgent, [
    ...SKILL_NAMES,
    'escalate',
    END,
  ]);

  for (const name of SKILL_NAMES) {
    graph.addConditionalEdges(name, routeFromTool, ['escalate', 'agent']);
  }

  graph.addEdge('escalate', END);

  return graph.compile({ checkpointer: checkpointer ?? undefined });
}

module.exports = { buildGraph };
