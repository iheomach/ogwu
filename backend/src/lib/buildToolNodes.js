const { ToolMessage } = require('@langchain/core/messages');
const z = require('zod');

// ── Output schemas — validate the `data` field of the envelope ───────────────
// Uses .passthrough() so extra fields don't cause false rejections.

const HospitalItemSchema = z.object({
  id:             z.string().nullable(),
  name:           z.string(),
  is_onboarded:   z.boolean(),
  phone:          z.string().nullable().optional(),
  distance_km:    z.number().nullable().optional(),
  standout_phrase: z.string().nullable().optional(),
  address:        z.string().nullable().optional(),
}).passthrough();

const OUTPUT_SCHEMAS = {
  searchHospitals: z.object({
    hospitals: z.array(HospitalItemSchema),
    note: z.string().optional(),
  }),

  getHospitalBookingInfo: z.discriminatedUnion('type', [
    z.object({
      type:             z.literal('onboarded'),
      hospital_id:      z.string(),
      hospital_name:    z.string(),
      available_slots:  z.array(z.any()),
      instructions:     z.string(),
    }),
    z.object({
      type:    z.literal('onboarded_no_slots'),
      message: z.string(),
      phone:   z.string().nullable().optional(),
    }),
    z.object({
      type:          z.literal('not_onboarded'),
      hospital_name: z.string(),
      phone:         z.string().nullable().optional(),
      call_script:   z.string(),
      instructions:  z.string(),
    }),
  ]),

  bookAppointment: z.object({
    success:        z.literal(true),
    appointment_id: z.string(),
    starts_at:      z.string(),
    meeting_url:    z.string().nullable(),
    hospital_id:    z.string(),
    hospital_name:  z.string(),
    message:        z.string(),
  }),

  flagEmergency: z.object({
    flagged:  z.literal(true),
    reason:   z.string(),
    message:  z.string(),
  }),

  createConsult: z.object({
    success:    z.boolean(),
    consult_id: z.string().nullable().optional(),
  }),

  endConversation: z.object({
    ended:         z.literal(true),
    hospital_id:   z.string(),
    hospital_name: z.string(),
  }),

  getPatientHistory: z.object({
    history: z.array(z.any()),
  }),
};

const SKILL_NAMES = [
  'searchHospitals',
  'getHospitalBookingInfo',
  'bookAppointment',
  'flagEmergency',
  'createConsult',
  'endConversation',
  'getPatientHistory',
];

// Each skill only receives the context keys it needs.
const SKILL_CONTEXT_KEYS = {
  searchHospitals:        ['z', 'supabase', 'patientLat', 'patientLon', 'haversineKm', 'triageContext', 'profile', 'conversationContext'],
  getHospitalBookingInfo: ['z', 'profile', 'supabase', 'fetchAvailableSlots'],
  bookAppointment:        ['z', 'supabase', 'profile', 'getClinicCalendarAuth', 'safeText'],
  flagEmergency:          ['z', 'safeText'],
  createConsult:          ['z', 'profile', 'healthlake', 'safeText', 'normalizeUrgency'],
  endConversation:        ['z'],
  getPatientHistory:      ['z', 'profile', 'healthlake'],
};

function scopedCtx(skillCtx, name) {
  const allowed = SKILL_CONTEXT_KEYS[name] ?? Object.keys(skillCtx);
  return Object.fromEntries(
    allowed.filter((k) => k in skillCtx).map((k) => [k, skillCtx[k]]),
  );
}

// Detect legacy { error: string, message?: string } shapes and normalise to envelope.
function toEnvelope(rawResult) {
  if (rawResult && typeof rawResult === 'object' && 'error' in rawResult && !('ok' in rawResult)) {
    return { ok: false, data: null, error: rawResult.message ?? rawResult.error ?? 'tool error' };
  }
  return { ok: true, data: rawResult ?? null, error: null };
}

// ── Retry logic ───────────────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [1000, 2000, 4000];

function isRetriable(msg) {
  const s = String(msg ?? '').toLowerCase();
  return (
    s.includes('econnreset') || s.includes('etimedout') || s.includes('enotfound') ||
    s.includes('fetch failed') || s.includes('rate limit') || s.includes('429') ||
    s.includes('503') || s.includes('service unavailable') || s.includes('network error')
  );
}

async function executeWithRetry(skill, args, toolName) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const result = await skill.execute(args);
      // Retry on unexpected errors whose message signals a transient network issue
      if (result?.error === 'unexpected' && isRetriable(result?.message) && attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt];
        console.warn(`[tool] ${toolName} retriable result (attempt ${attempt + 1}), retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (attempt > 0 && !(result?.error === 'unexpected' && isRetriable(result?.message))) {
        console.log(`[tool] ${toolName} recovered after ${attempt} retry(s)`);
      }
      return result;
    } catch (err) {
      if (!isRetriable(err?.message) || attempt === RETRY_DELAYS_MS.length) throw err;
      const delay = RETRY_DELAYS_MS[attempt];
      console.warn(`[tool] ${toolName} threw retriable error (attempt ${attempt + 1}), retrying in ${delay}ms: ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

function extractLastAiReasoning(messages) {
  const lastAi = [...(messages ?? [])].reverse().find((m) => m._getType?.() === 'ai');
  if (!lastAi) return null;
  const c = lastAi.content;
  const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p.type === 'text').map((p) => p.text).join('') : '';
  return text.slice(0, 600) || null;
}

// ── Logging ───────────────────────────────────────────────────────────────────

// Fire-and-forget — never throws; a logging failure must not abort a tool call.
async function logToolCall(supabase, { patientId, toolName, inputArgs, output, ok, errorMsg, latencyMs }) {
  if (!supabase) return;
  try {
    await supabase.from('tool_call_logs').insert({
      patient_id: patientId ?? null,
      tool_name: toolName,
      input_args: inputArgs ?? null,
      output: output ?? null,
      ok,
      error_msg: errorMsg ?? null,
      latency_ms: latencyMs,
    });
  } catch (e) {
    console.warn('[tool_call_logs] write failed:', e?.message);
  }
}

function buildToolDispatcher(skillCtx) {
  const skills = Object.fromEntries(
    SKILL_NAMES.map((name) => {
      const factory = require(`../skills/${name}.js`);
      return [name, factory(scopedCtx(skillCtx, name))];
    }),
  );

  const patientId = skillCtx.profile?.id ?? null;

  return async function toolDispatcherNode(state) {
    const lastMessage = state.messages[state.messages.length - 1];
    const toolCalls = lastMessage?.tool_calls ?? [];

    const toolMessages = [];
    const toolResults = { ...state.tool_results };
    const stateUpdate = {};
    let batchFailures = 0;

    for (const toolCall of toolCalls) {
      // ── Session guards ────────────────────────────────────────────────────

      if (toolCall.name === 'flagEmergency' && state.tool_results?.flagEmergency?.flagged) {
        const envelope = { ok: true, data: { flagged: true, message: 'Emergency already escalated this session.' }, error: null };
        toolMessages.push(new ToolMessage({ content: JSON.stringify(envelope), tool_call_id: toolCall.id }));
        continue;
      }

      if (toolCall.name === 'bookAppointment' && state.tool_results?.bookAppointment?.success === false) {
        const envelope = { ok: false, data: null, error: 'bookAppointment already failed this session. Do not retry. Tell the patient to call the hospital directly.' };
        toolMessages.push(new ToolMessage({ content: JSON.stringify(envelope), tool_call_id: toolCall.id }));
        continue;
      }

      // ── Unknown tool ──────────────────────────────────────────────────────

      const skill = skills[toolCall.name];
      if (!skill) {
        const envelope = { ok: false, data: null, error: `Unknown tool: ${toolCall.name}` };
        toolMessages.push(new ToolMessage({ content: JSON.stringify(envelope), tool_call_id: toolCall.id }));
        continue;
      }

      // ── Input validation ──────────────────────────────────────────────────

      const parsed = skill.inputSchema.safeParse(toolCall.args ?? {});
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
          .join('; ');
        const envelope = { ok: false, data: null, error: `Invalid arguments — ${detail}` };
        toolMessages.push(new ToolMessage({ content: JSON.stringify(envelope), tool_call_id: toolCall.id }));
        logToolCall(skillCtx.supabase, { patientId, toolName: toolCall.name, inputArgs: toolCall.args, output: envelope, ok: false, errorMsg: envelope.error, latencyMs: 0 });
        continue;
      }

      // ── Execute + log ─────────────────────────────────────────────────────

      const startMs = Date.now();
      let rawResult = null;
      let envelope;

      try {
        rawResult = await executeWithRetry(skill, parsed.data, toolCall.name);
        envelope = toEnvelope(rawResult);

        // Validate output shape if a schema exists for this tool
        if (envelope.ok && OUTPUT_SCHEMAS[toolCall.name]) {
          const outParsed = OUTPUT_SCHEMAS[toolCall.name].safeParse(envelope.data);
          if (!outParsed.success) {
            const detail = outParsed.error.issues
              .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
              .join('; ');
            console.error(`[tool] ${toolCall.name} output contract violated: ${detail}`);
            envelope = { ok: false, data: null, error: `Output contract violated — ${detail}` };
          }
        }
      } catch (err) {
        envelope = { ok: false, data: null, error: err?.message ?? 'Tool execution failed' };
      }

      const latencyMs = Date.now() - startMs;
      console.log(`[tool] ${toolCall.name} ok=${envelope.ok} ${latencyMs}ms`);

      if (!envelope.ok) batchFailures++;

      logToolCall(skillCtx.supabase, {
        patientId,
        toolName: toolCall.name,
        inputArgs: parsed.data,
        output: envelope.ok ? envelope : { ...envelope, model_reasoning: extractLastAiReasoning(state.messages) },
        ok: envelope.ok,
        errorMsg: envelope.ok ? null : envelope.error,
        latencyMs,
      });

      // Raw result kept in state so session guards can inspect specific fields.
      toolResults[toolCall.name] = rawResult ?? envelope;
      toolMessages.push(new ToolMessage({
        content: JSON.stringify(envelope),
        tool_call_id: toolCall.id,
      }));

      if (toolCall.name === 'flagEmergency' && rawResult?.flagged) {
        stateUpdate.urgency = 'emergency';
      }
      if (toolCall.name === 'bookAppointment') {
        if (rawResult?.success) stateUpdate.booking_state = rawResult;
        toolResults.bookAppointment = rawResult;
      }
    }

    const newFailureCount = (state.failure_count ?? 0) + batchFailures;
    return { ...stateUpdate, messages: toolMessages, tool_results: toolResults, failure_count: newFailureCount };
  };
}

function buildToolNodes(skillCtx) {
  return { tools: buildToolDispatcher(skillCtx) };
}

module.exports = { buildToolNodes, buildToolDispatcher, SKILL_NAMES };
