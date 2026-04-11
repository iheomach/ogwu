module.exports = function flagEmergencySkill({ z, safeText }) {
  return {
    inputSchema: z.object({
      reason: z.string().describe('Why this is an emergency'),
    }),
    execute: async ({ reason }) => ({
      flagged: true,
      reason: safeText(reason, 300),
      message: 'Emergency flagged. If in immediate danger, call emergency services or go to the nearest A&E now.',
    }),
  };
};
