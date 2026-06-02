module.exports = function runTriageSkill({ z }) {
  return {
    inputSchema: z.object({}),
    execute: async () => ({ triggered: true }),
  };
};
