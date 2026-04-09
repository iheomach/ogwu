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
          parameters: z.object({
            specialty: z.string(),
            state: z.string(),
            has_emergency: z.boolean().optional(),
            tier: z.number().optional(),
            country: z.string().optional().describe('Optional country code like NG or IN'),
          }),
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
          parameters: z.object({
            complaint: z.string(),
            urgency: z.enum(['emergency', 'urgent', 'routine', 'self_care']),
            symptoms: z.array(z.string()),
            recommended_specialty: z.string().optional(),
            care_pathway: z.string(),
            recommended_hospital_ids: z.array(z.string()).optional(),
            is_emergency_flagged: z.boolean().optional(),
          }),
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
          parameters: z.object({
            reason: z.string(),
          }),
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
          parameters: z.object({
            limit: z.number().default(5),
          }),
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
          parameters: z.object({
            medication: z.string(),
          }),
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

    // Convert StreamTextResult to UI message stream Response, then pipe to Express.
    // This streams in the data protocol format that useChat expects.
    const response = result.toUIMessageStreamResponse();

    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (!response.body) {
      res.end();
      return;
    }

    // Pipe the Web ReadableStream to Express response.
    const { Readable } = require('stream');
    Readable.fromWeb(response.body).pipe(res);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Failed to run agent' });
  }
});

module.exports = router;
