module.exports = function checkDrugInteractionSkill({ z, profile, safeText }) {
  return {
    inputSchema: z.object({
      medication: z.string().describe('Medication name to check'),
    }),
    execute: async ({ medication }) => {
      const med = safeText(medication, 80);
      const allergies = String(profile?.allergies || '').split(',').map((x) => x.trim()).filter(Boolean);
      const risks = allergies
        .filter((a) => med.toLowerCase().includes(a.toLowerCase()))
        .map((a) => `Patient reports allergy to ${a}`);
      return { medication: med, risks, safe: risks.length === 0, note: 'Basic check only. Always confirm with a pharmacist or clinician.' };
    },
  };
};
