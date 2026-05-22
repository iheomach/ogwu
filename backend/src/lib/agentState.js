const { Annotation, messagesStateReducer } = require('@langchain/langgraph');

const AgentState = Annotation.Root({
  messages:      Annotation({ reducer: messagesStateReducer }),
  urgency:       Annotation({ reducer: (_, next) => next, default: () => null }),
  patient_id:    Annotation({ reducer: (_, next) => next, default: () => null }),
  booking_state: Annotation({ reducer: (_, next) => next, default: () => null }),
  tool_results:  Annotation({ reducer: (_, next) => next, default: () => ({}) }),
  input_blocked: Annotation({ reducer: (_, next) => next, default: () => false }),
  failure_count: Annotation({ reducer: (_, next) => next ?? 0, default: () => 0 }),
});

module.exports = { AgentState };
