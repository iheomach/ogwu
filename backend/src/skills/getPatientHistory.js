module.exports = function getPatientHistorySkill({ z, profile, healthlake }) {
  return {
    inputSchema: z.object({
      limit: z.number().int().min(1).max(10).default(5),
    }),
    execute: async ({ limit }) => {
      try {
        const history = await healthlake.getClinicalImpressions(profile.id, limit);
        return { history };
      } catch (e) {
        return { error: String(e?.message ?? e) };
      }
    },
  };
};
