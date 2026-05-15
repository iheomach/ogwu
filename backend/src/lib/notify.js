const supabase = require('./supabase');

async function notifyEmergency({ patientId, reason }) {
  if (!patientId) return;
  try {
    const { data: appt } = await supabase
      .from('appointments')
      .select('hospital_id')
      .eq('patient_id', patientId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase
      .from('emergency_alerts')
      .insert({
        patient_id: patientId,
        hospital_id: appt?.hospital_id ?? null,
        reason: reason ?? null,
      });

    if (error) console.error('[notify] insert failed:', error.message);
    else console.warn(`[notify] emergency alert — patient=${patientId} hospital=${appt?.hospital_id ?? 'unknown'}`);
  } catch (err) {
    console.error('[notify] unexpected error:', err?.message);
  }
}

module.exports = { notifyEmergency };
