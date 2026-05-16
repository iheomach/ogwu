const INTERACTIONS = [
  {
    drugs: ['warfarin', 'aspirin'],
    risk: 'severe',
    note: 'This combination significantly increases the risk of serious bleeding. Do not take together without explicit medical supervision.',
  },
  {
    drugs: ['sertraline', 'phenelzine'],
    risk: 'severe',
    note: 'Risk of life-threatening serotonin syndrome. These must never be combined.',
  },
  {
    drugs: ['sertraline', 'maoi'],
    risk: 'severe',
    note: 'Risk of life-threatening serotonin syndrome. SSRIs and MAOIs must never be combined.',
  },
  {
    drugs: ['methotrexate', 'ibuprofen'],
    risk: 'severe',
    note: 'NSAIDs can dramatically increase methotrexate toxicity. Avoid this combination.',
  },
  {
    drugs: ['methotrexate', 'nsaid'],
    risk: 'severe',
    note: 'NSAIDs can dramatically increase methotrexate toxicity. Avoid this combination.',
  },
  {
    drugs: ['digoxin', 'amiodarone'],
    risk: 'severe',
    note: 'Amiodarone raises digoxin levels, risking toxicity. Urgent cardiology review required.',
  },
  {
    drugs: ['ibuprofen', 'lisinopril'],
    risk: 'moderate',
    note: 'NSAIDs can reduce the effectiveness of ACE inhibitors and affect kidney function. Discuss with your doctor.',
  },
  {
    drugs: ['ibuprofen', 'ace inhibitor'],
    risk: 'moderate',
    note: 'NSAIDs can reduce the effectiveness of ACE inhibitors and affect kidney function. Discuss with your doctor.',
  },
  {
    drugs: ['simvastatin', 'erythromycin'],
    risk: 'moderate',
    note: 'Erythromycin inhibits simvastatin metabolism, raising the risk of muscle damage (myopathy). A dose adjustment or alternative may be needed.',
  },
  {
    drugs: ['chloroquine', 'metformin'],
    risk: 'moderate',
    note: 'Chloroquine can alter blood sugar levels, which may interact with metformin. Monitor blood glucose and consult your doctor.',
  },
  {
    drugs: ['paracetamol', 'amoxicillin'],
    risk: 'none',
    note: 'No clinically significant interaction between paracetamol and amoxicillin. Generally safe to take together.',
  },
  {
    drugs: ['acetaminophen', 'amoxicillin'],
    risk: 'none',
    note: 'No clinically significant interaction between paracetamol and amoxicillin. Generally safe to take together.',
  },
  {
    drugs: ['omeprazole', 'vitamin d'],
    risk: 'none',
    note: 'No known interaction between omeprazole and vitamin D supplements.',
  },
  {
    drugs: ['artemether', 'oral rehydration'],
    risk: 'none',
    note: 'No known interaction between artemether-lumefantrine and oral rehydration salts.',
  },
  {
    drugs: ['lumefantrine', 'oral rehydration'],
    risk: 'none',
    note: 'No known interaction between artemether-lumefantrine and oral rehydration salts.',
  },
];

module.exports = function checkDrugInteractionSkill({ z, profile, safeText }) {
  return {
    inputSchema: z.object({
      medications: z.array(z.string()).describe('List of medications to check for interactions'),
    }),
    execute: async ({ medications }) => {
      const meds = medications.map((m) => safeText(m, 80).toLowerCase());

      const allergies = String(profile?.allergies || '')
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
      const allergyRisks = meds
        .filter((m) => allergies.some((a) => a && m.includes(a)))
        .map((m) => `Patient has a reported allergy to ${m}`);

      const matched = [];
      for (const entry of INTERACTIONS) {
        const hits = entry.drugs.filter((d) => meds.some((m) => m.includes(d) || d.includes(m)));
        if (hits.length === entry.drugs.length) {
          matched.push(entry);
        }
      }

      const highestRisk =
        matched.find((i) => i.risk === 'severe') ??
        matched.find((i) => i.risk === 'moderate') ??
        null;

      const overallRisk = highestRisk?.risk ?? 'none';
      const flagged = allergyRisks.length > 0 || overallRisk !== 'none';

      return {
        medications: meds,
        allergy_risks: allergyRisks,
        interactions: matched,
        overall_risk: overallRisk,
        flagged,
        safe: !flagged,
        note: highestRisk?.note ?? 'No known interactions found for this combination.',
      };
    },
  };
};
