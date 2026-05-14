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

function makeNode(skillName, skillCtx) {
  const factory = require(`../skills/${skillName}.js`);
  const skill = factory(skillCtx);

  return async function (state) {
    const lastMessage = state.messages[state.messages.length - 1];
    const toolCalls = (lastMessage?.tool_calls ?? []).filter((tc) => tc.name === skillName);
    if (toolCalls.length === 0) return {};

    // Pause before booking and wait for explicit patient confirmation
    if (skillName === 'bookAppointment') {
      const toolCall = toolCalls[0];
      const confirmed = interrupt({
        type: 'booking_confirmation',
        slot: toolCall.args.starts_at_local,
        time_zone: toolCall.args.time_zone,
        hospital_id: toolCall.args.hospital_id,
        reason: toolCall.args.reason,
      });

      if (!confirmed) {
        return {
          messages: [new ToolMessage({
            content: JSON.stringify({ cancelled: true, message: 'Booking cancelled by patient.' }),
            tool_call_id: toolCall.id,
          })],
          tool_results: { ...state.tool_results, bookAppointment: { cancelled: true } },
        };
      }
    }

    const toolMessages = [];
    let resultData = null;

    for (const toolCall of toolCalls) {
      let result;
      try {
        result = await skill.execute(toolCall.args);
      } catch (err) {
        result = { error: err?.message ?? 'Tool execution failed' };
      }
      resultData = result;
      toolMessages.push(
        new ToolMessage({
          content: typeof result === 'string' ? result : JSON.stringify(result),
          tool_call_id: toolCall.id,
        }),
      );
    }

    const stateUpdate = {
      messages: toolMessages,
      tool_results: { ...state.tool_results, [skillName]: resultData },
    };

    // Per-tool state side-effects
    if (skillName === 'flagEmergency' && resultData?.flagged) {
      stateUpdate.urgency = 'emergency';
    }

    if (skillName === 'bookAppointment' && resultData?.success) {
      stateUpdate.booking_state = resultData;
    }

    return stateUpdate;
  };
}

function buildToolNodes(skillCtx) {
  return Object.fromEntries(
    SKILL_NAMES.map((name) => [name, makeNode(name, skillCtx)]),
  );
}

module.exports = { buildToolNodes, SKILL_NAMES };
