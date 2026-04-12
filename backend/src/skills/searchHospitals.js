module.exports = function searchHospitalsSkill({ z, supabase, patientLat, patientLon, haversineKm }) {
  return {
    inputSchema: z.object({
      state: z.string().optional().describe('City or state the patient is in (fallback if GPS unavailable), e.g. Lagos, Abuja, California'),
      has_emergency: z.boolean().optional().describe('True if emergency capability is required'),
    }),
    execute: async ({ state, has_emergency }) => {
      try {
        const stateClean = String(state || '').trim();
        const hasCoords = patientLat != null && patientLon != null;
        console.log(`[searchHospitals] state="${stateClean}" has_emergency=${has_emergency} coords=${hasCoords ? `${patientLat},${patientLon}` : 'none'}`);

        let q = supabase
          .from('hospitals_directory')
          .select('id,name,city,state,country,type,tier,specialties,phone,website,has_emergency,is_onboarded,lat,lon')
          .eq('is_active', true);
        if (has_emergency) q = q.eq('has_emergency', true);

        const { data: all, error } = await q.limit(200);
        if (error) return { error: 'db_error', message: error.message };
        if (!all || all.length === 0) {
          return { error: 'no_hospitals', message: 'No hospitals found in the network. Tell the patient to call emergency services (199 or 112) or search Google Maps for nearby clinics.' };
        }

        let ranked;

        if (hasCoords) {
          ranked = all
            .map((h) => ({
              ...h,
              distance_km: (h.lat != null && h.lon != null)
                ? Math.round(haversineKm(patientLat, patientLon, h.lat, h.lon))
                : 99999,
            }))
            .sort((a, b) => a.distance_km - b.distance_km)
            .slice(0, 3)
            .map(({ lat: _lat, lon: _lon, ...rest }) => rest);
          console.log(`[searchHospitals] top-3: ${ranked.map((h) => `${h.name} ${h.distance_km}km`).join(' | ')}`);
        } else if (stateClean) {
          const matches = all.filter((h) => h.state?.toLowerCase().includes(stateClean.toLowerCase()));
          const pool = matches.length > 0 ? matches : all;
          ranked = pool.slice(0, 3).map(({ lat: _lat, lon: _lon, ...rest }) => rest);
          const note = matches.length === 0
            ? `No hospitals found near "${stateClean}" — showing available hospitals in the network instead. Inform the patient.`
            : undefined;
          return { hospitals: ranked, ...(note ? { note } : {}) };
        } else {
          return { error: 'no_location', message: 'Location is required. Ask the patient for their city or state before searching.' };
        }

        return { hospitals: ranked };
      } catch (e) {
        return { error: 'unexpected', message: String(e?.message ?? e) };
      }
    },
  };
};
