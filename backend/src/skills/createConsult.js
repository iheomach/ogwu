module.exports = function createConsultSkill({ z, profile, healthlake, safeText, normalizeUrgency }) {
  return {
    inputSchema: z.object({
      complaint: z.string().describe("Chief complaint in the patient's own words"),
      urgency: z.enum(['emergency', 'urgent', 'routine', 'self_care']),
      symptoms: z.array(z.string()),
      recommended_specialty: z.string().optional(),
      care_pathway: z.string().describe('Clear next steps for the patient'),
      recommended_hospital_ids: z.array(z.string()).optional(),
      is_emergency_flagged: z.boolean().optional(),
    }),
    execute: async (params) => {
      try {
        const fhirId = await healthlake.writeClinicalImpression(profile.id, {
          complaint: safeText(params.complaint, 400),
          urgency: normalizeUrgency(params.urgency),
          symptoms: Array.isArray(params.symptoms) ? params.symptoms.map((s) => safeText(s, 80)).filter(Boolean) : [],
          recommended_specialty: params.recommended_specialty ? safeText(params.recommended_specialty, 80) : null,
          care_pathway: safeText(params.care_pathway, 4000),
          is_emergency_flagged: !!params.is_emergency_flagged,
        });
        return { success: true, consult_id: fhirId };
      } catch (e) {
        return { success: false, error: String(e?.message ?? e) };
      }
    },
  };
};
