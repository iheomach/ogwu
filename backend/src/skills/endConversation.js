module.exports = function endConversationSkill({ z }) {
  return {
    inputSchema: z.object({
      hospital_id: z.string().describe('UUID of the hospital the appointment was booked with'),
      hospital_name: z.string().describe('Display name of the hospital'),
    }),
    execute: async ({ hospital_id, hospital_name }) => {
      // Client-side signal only — the app replaces the input bar with a share button.
      return { ended: true, hospital_id, hospital_name };
    },
  };
};
