const { ToolMessage } = require('@langchain/core/messages');
const { interrupt } = require('@langchain/langgraph');

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

    // bookAppointment must be handled first — interrupt() pauses the graph
    const bookingCall = toolCalls.find((tc) => tc.name === 'bookAppointment');
    if (bookingCall) {
      const confirmed = interrupt({
        type: 'booking_confirmation',
        slot: bookingCall.args.starts_at_local,
        time_zone: bookingCall.args.time_zone,
        hospital_id: bookingCall.args.hospital_id,
        reason: bookingCall.args.reason,
      });

      if (!confirmed) {
        return {
          messages: [new ToolMessage({
            content: JSON.stringify({ cancelled: true, message: 'Booking cancelled by patient.' }),
            tool_call_id: bookingCall.id,
          })],
          tool_results: { ...state.tool_results, bookAppointment: { cancelled: true } },
        };
      }
    }

    const toolMessages = [];
    const toolResults = { ...state.tool_results };
    const stateUpdate = {};

    for (const toolCall of toolCalls) {
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
      if (toolCall.name === 'bookAppointment' && result?.success) {
        stateUpdate.booking_state = result;
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
