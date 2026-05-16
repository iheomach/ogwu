const { ToolMessage } = require('@langchain/core/messages');

const SKILL_NAMES = [
  'searchHospitals',
  'getHospitalBookingInfo',
  'bookAppointment',
  'flagEmergency',
  'checkDrugInteraction',
  'createConsult',
  'endConversation',
  'getPatientHistory',
];

function buildToolDispatcher(skillCtx) {
  const skills = Object.fromEntries(
    SKILL_NAMES.map((name) => {
      const factory = require(`../skills/${name}.js`);
      return [name, factory(skillCtx)];
    }),
  );

  return async function toolDispatcherNode(state) {
    const lastMessage = state.messages[state.messages.length - 1];
    const toolCalls = lastMessage?.tool_calls ?? [];

    const toolMessages = [];
    const toolResults = { ...state.tool_results };
    const stateUpdate = {};

    for (const toolCall of toolCalls) {
      // Prevent double-escalation: flagEmergency already ran this session.
      if (toolCall.name === 'flagEmergency' && state.tool_results?.flagEmergency?.flagged) {
        toolMessages.push(new ToolMessage({
          content: JSON.stringify({ flagged: true, message: 'Emergency already escalated this session.' }),
          tool_call_id: toolCall.id,
        }));
        continue;
      }

      // Prevent the agent from retrying bookAppointment after a failure in the same session.
      if (toolCall.name === 'bookAppointment' && state.tool_results?.bookAppointment?.success === false) {
        toolMessages.push(new ToolMessage({
          content: JSON.stringify({ success: false, error: 'already_failed', message: 'bookAppointment already failed this session. Do not retry. Tell the patient to call the hospital directly.' }),
          tool_call_id: toolCall.id,
        }));
        continue;
      }

      const skill = skills[toolCall.name];
      if (!skill) {
        toolMessages.push(new ToolMessage({
          content: JSON.stringify({ error: `Unknown tool: ${toolCall.name}` }),
          tool_call_id: toolCall.id,
        }));
        continue;
      }

      let result;
      try {
        result = await skill.execute(toolCall.args);
      } catch (err) {
        result = { error: err?.message ?? 'Tool execution failed' };
      }

      toolResults[toolCall.name] = result;
      toolMessages.push(new ToolMessage({
        content: typeof result === 'string' ? result : JSON.stringify(result),
        tool_call_id: toolCall.id,
      }));

      if (toolCall.name === 'flagEmergency' && result?.flagged) {
        stateUpdate.urgency = 'emergency';
      }
      if (toolCall.name === 'bookAppointment') {
        if (result?.success) stateUpdate.booking_state = result;
        // Always persist bookAppointment result so the retry guard can inspect it.
        toolResults.bookAppointment = result;
      }
    }

    return { ...stateUpdate, messages: toolMessages, tool_results: toolResults };
  };
}

// Legacy per-tool nodes kept for backward compatibility with any direct imports
function buildToolNodes(skillCtx) {
  return { tools: buildToolDispatcher(skillCtx) };
}

module.exports = { buildToolNodes, buildToolDispatcher, SKILL_NAMES };
