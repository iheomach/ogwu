const express = require('express');

const router = express.Router();

const authenticate = require('../middleware/auth');
const supabase = require('../lib/supabase');
const { buildSystemPrompt } = require('../lib/buildSystemPrompt');

function safeText(s, maxLen) {
  const out = typeof s === 'string' ? s.trim() : '';
  if (!out) return '';
  return out.length > maxLen ? out.slice(0, maxLen) : out;
}

async function loadPatientProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    // NOTE: `age` and legacy `sex` were dropped in `supabase/migrations/004_drop_legacy_profile_columns.sql`.
    // We compute age from `dob` when needed and use `biological_sex`.
    .select('id, phone, dob, biological_sex, allergies, known_conditions')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || { id: userId };
}

function normalizeUrgency(u) {
  const v = String(u || '').toLowerCase();
  if (v === 'emergency' || v === 'urgent' || v === 'routine' || v === 'self_care') return v;
  return 'routine';
}

// Agent chat endpoint (streams AI SDK UI message stream over SSE)
router.post('/chat', authenticate, async (req, res) => {
  try {
    const profile = await loadPatientProfile(req.user.id);

    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const locale = safeText(req.body?.locale, 10) || null;

    // Dynamic imports keep the backend CommonJS without a full ESM migration.
    const [{ streamText, tool }, { openai }, { z }] = await Promise.all([
      import('ai'),
      import('@ai-sdk/openai'),
      import('zod'),
    ]);

    // The SDK converts these to JSON Schema internally before sending to OpenAI.
    // Do NOT use plain objects here; they produce type: "None" and OpenAI rejects them.
    const searchHospitalsSchema = z.object({
      specialty: z.string().describe('Medical specialty, e.g. cardiology, nephrology'),
      state: z.string().describe('Nigerian state or region the patient is in'),
      has_emergency: z.boolean().optional().describe('Filter for emergency capability'),
      tier: z.number().int().optional().describe('Hospital tier: 1=primary, 2=secondary, 3=tertiary'),
      country: z.string().optional().describe('Country name, defaults to Nigeria'),
    });
 
    const createConsultSchema = z.object({
      complaint: z.string().describe('Chief complaint in the patient\'s own words'),
      urgency: z.enum(['emergency', 'urgent', 'routine', 'self_care']).describe('Triage urgency level'),
      symptoms: z.array(z.string()).describe('List of symptoms reported'),
      recommended_specialty: z.string().optional().describe('Recommended medical specialty'),
      care_pathway: z.string().describe('Clear next steps for the patient'),
      recommended_hospital_ids: z.array(z.string()).optional().describe('UUIDs of recommended hospitals'),
      is_emergency_flagged: z.boolean().optional().describe('Whether this was flagged as an emergency'),
    });
 
    const flagEmergencySchema = z.object({
      reason: z.string().describe('Why this is classified as an emergency'),
    });
 
    const getPatientHistorySchema = z.object({
      limit: z.number().int().min(1).max(10).default(5).describe('Number of recent consults to retrieve'),
    });
 
    const checkDrugInteractionSchema = z.object({
      medication: z.string().describe('Medication name to check'),
    });

    const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const system = buildSystemPrompt({
      ...profile,
      country: locale ? null : null,
    });

    const result = streamText({
      model: openai(modelName),
      system,
      messages,
      maxSteps: 5,
      tools: {
        searchHospitals: tool({
          description:
            'Search for hospitals by medical specialty and patient location. Call this when triage indicates a facility visit is needed.',
          inputSchema: searchHospitalsSchema,
          execute: async ({ specialty, state, has_emergency, tier, country }) => {
            let q = supabase
              .from('hospitals_directory')
              .select('id,name,city,state,type,tier,specialties,phone,website,has_emergency,is_onboarded')
              .eq('is_active', true)
              .ilike('state', String(state))
              .contains('specialties', [String(specialty)]);

            if (country) q = q.eq('country', String(country));
            if (typeof tier === 'number') q = q.eq('tier', tier);
            if (has_emergency) q = q.eq('has_emergency', true);

            const { data, error } = await q.limit(5);
            if (error) return { error: error.message };
            return { hospitals: data || [] };
          },
        }),

        createConsult: tool({
          description:
            'Save a structured consult record once triage is complete. Call this automatically — do not ask the patient to initiate saving.',
          inputSchema: createConsultSchema,
          execute: async (params) => {
            const payload = {
              patient_id: profile.id,
              complaint: safeText(params.complaint, 400),
              urgency: normalizeUrgency(params.urgency),
              symptoms: Array.isArray(params.symptoms) ? params.symptoms.map((s) => safeText(s, 80)).filter(Boolean) : [],
              recommended_specialty: params.recommended_specialty ? safeText(params.recommended_specialty, 80) : null,
              care_pathway: safeText(params.care_pathway, 4000),
              recommended_hospital_ids: Array.isArray(params.recommended_hospital_ids)
                ? params.recommended_hospital_ids.map(String)
                : null,
              is_emergency_flagged: !!params.is_emergency_flagged,
            };

            const { data, error } = await supabase
              .from('consults')
              .insert(payload)
              .select('id')
              .single();

            if (error) return { success: false, error: error.message };
            return { success: true, consult_id: data.id };
          },
        }),

        flagEmergency: tool({
          description:
            'Flag this consultation as an emergency requiring immediate action. Call this as soon as symptoms suggest an emergency — before other tools.',
          inputSchema: flagEmergencySchema,
          execute: async ({ reason }) => {
            return {
              flagged: true,
              reason: safeText(reason, 300),
              message:
                'Emergency flagged. If you are in immediate danger, call your local emergency number or go to the nearest emergency department now.',
            };
          },
        }),

        getPatientHistory: tool({
          description:
            "Retrieve the patient's recent consult history.",
          inputSchema: getPatientHistorySchema,
          execute: async ({ limit }) => {
            const lim = Math.max(1, Math.min(10, Number(limit || 5)));
            const { data, error } = await supabase
              .from('consults')
              .select('id,complaint,urgency,care_pathway,created_at')
              .eq('patient_id', profile.id)
              .order('created_at', { ascending: false })
              .limit(lim);
            if (error) return { error: error.message };
            return { history: data || [] };
          },
        }),

        checkDrugInteraction: tool({
          description:
            "Check if a medication is safe given the patient's allergies and existing conditions.",
          inputSchema: checkDrugInteractionSchema,
          execute: async ({ medication }) => {
            const med = safeText(medication, 80);
            const allergies = String(profile?.allergies || '')
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean);

            const risks = [];
            for (const a of allergies) {
              if (med.toLowerCase().includes(a.toLowerCase())) risks.push(`Patient reports allergy to ${a}`);
            }

            return {
              medication: med,
              risks,
              safe: risks.length === 0,
              note: 'This is a basic check only. Always confirm with a pharmacist or clinician.',
            };
          },
        }),
      },
    });

    // Emit the v4-compatible data stream format that @ai-sdk/ui-utils@1.x expects.
    // ai@5's pipeUIMessageStreamToResponse sends SSE (data: ...) which the v4
    // client parser rejects with "Invalid code data".
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Vercel-AI-Data-Stream', 'v1');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    function writePart(code, value) {
      res.write(`${code}:${JSON.stringify(value)}\n`);
    }

    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            writePart('0', part.text);
            break;
          case 'tool-input-start':
            writePart('b', { toolCallId: part.id, toolName: part.toolName });
            break;
          case 'tool-input-delta':
            writePart('c', { toolCallId: part.id, argsTextDelta: part.delta });
            break;
          case 'tool-call':
            writePart('9', { toolCallId: part.toolCallId, toolName: part.toolName, args: part.args });
            break;
          case 'tool-result':
            writePart('a', { toolCallId: part.toolCallId, result: part.result });
            break;
          case 'start-step':
            writePart('f', { messageId: `step-${Date.now()}` });
            break;
          case 'finish-step':
            writePart('e', {
              finishReason: part.finishReason,
              usage: {
                promptTokens: part.usage?.promptTokens ?? 0,
                completionTokens: part.usage?.completionTokens ?? 0,
              },
              isContinued: false,
            });
            break;
          case 'finish':
            writePart('d', {
              finishReason: part.finishReason,
              usage: {
                promptTokens: part.totalUsage?.promptTokens ?? 0,
                completionTokens: part.totalUsage?.completionTokens ?? 0,
              },
            });
            break;
          case 'error':
            writePart('3', String(part.error?.message ?? part.error ?? 'Unknown error'));
            break;
        }
      }
    } catch (streamErr) {
      writePart('3', String(streamErr?.message ?? 'Stream error'));
    }

    res.end();
    return;
  } catch (err) {
    if (!res.headersSent) {
      res.status(400).json({ error: err?.message || 'Failed to run agent' });
    }
  }
});

module.exports = router;
