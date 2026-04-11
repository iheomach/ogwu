module.exports = function getPatientHistorySkill({ z, supabase, profile }) {
  return {
    inputSchema: z.object({
      limit: z.number().int().min(1).max(10).default(5),
    }),
    execute: async ({ limit }) => {
      try {
        const lim = Math.max(1, Math.min(10, Number(limit || 5)));
        const { data, error } = await supabase
          .from('consults')
          .select('id,complaint,urgency,care_pathway,created_at')
          .eq('patient_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(lim);
        if (error) return { error: error.message };
        return { history: data || [] };
      } catch (e) {
        return { error: String(e?.message ?? e) };
      }
    },
  };
};
