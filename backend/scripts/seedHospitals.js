// Allow env vars to be passed inline: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seedHospitals.js
// Falls back to dotenv if a .env file exists next to the script or in the backend root.
try { require('dotenv').config({ path: require('path').join(__dirname, '../.env') }); } catch {}

const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Usage: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role_key> node scripts/seedHospitals.js');
  process.exit(1);
}
const supabase = createClient(url, key);

const HOSPITALS = [
  // ── NIGERIA ─────────────────────────────────────────────────────────────────
  // Abia
  { name: 'Federal Medical Centre Umuahia', city: 'Umuahia', state: 'Abia', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+2348035678901', website: 'https://fmcumuahia.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Abia State Specialist Hospital', city: 'Umuahia', state: 'Abia', type: 'public', tier: 2, specialties: ['general practice', 'paediatrics', 'obstetrics'], phone: '+2348076543210', website: null, has_emergency: true, is_onboarded: false },

  // Adamawa
  { name: 'Federal Medical Centre Yola', city: 'Yola', state: 'Adamawa', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+2348055678901', website: 'https://fmcyola.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Modibbo Adama University Teaching Hospital', city: 'Yola', state: 'Adamawa', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'paediatrics', 'psychiatry'], phone: '+2348067890123', website: null, has_emergency: true, is_onboarded: false },

  // Akwa Ibom
  { name: 'University of Uyo Teaching Hospital', city: 'Uyo', state: 'Akwa Ibom', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+2348023456789', website: 'https://uuth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Ibom Specialist Hospital', city: 'Uyo', state: 'Akwa Ibom', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics'], phone: '+2348034567890', website: null, has_emergency: true, is_onboarded: false },

  // Anambra
  { name: 'Nnamdi Azikiwe University Teaching Hospital', city: 'Nnewi', state: 'Anambra', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'obstetrics', 'paediatrics', 'cardiology'], phone: '+2348045678901', website: 'https://nauth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Chukwuemeka Odumegwu Ojukwu University Teaching Hospital', city: 'Awka', state: 'Anambra', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery'], phone: '+2348056789012', website: null, has_emergency: true, is_onboarded: false },

  // Bauchi
  { name: 'Abubakar Tafawa Balewa University Teaching Hospital', city: 'Bauchi', state: 'Bauchi', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+2348067890123', website: 'https://atbuth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Federal Medical Centre Azare', city: 'Azare', state: 'Bauchi', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics'], phone: '+2348078901234', website: null, has_emergency: true, is_onboarded: false },

  // Bayelsa
  { name: 'Federal Medical Centre Yenagoa', city: 'Yenagoa', state: 'Bayelsa', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+2348089012345', website: 'https://fmcyenagoa.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Niger Delta University Teaching Hospital', city: 'Okolobiri', state: 'Bayelsa', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'paediatrics'], phone: '+2348090123456', website: null, has_emergency: true, is_onboarded: false },

  // Benue
  { name: 'Benue State University Teaching Hospital', city: 'Makurdi', state: 'Benue', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+2348012345678', website: 'https://bsuth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Federal Medical Centre Makurdi', city: 'Makurdi', state: 'Benue', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+2348023456781', website: null, has_emergency: true, is_onboarded: false },

  // Borno
  { name: 'University of Maiduguri Teaching Hospital', city: 'Maiduguri', state: 'Borno', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+2348034567892', website: 'https://umth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'State Specialist Hospital Maiduguri', city: 'Maiduguri', state: 'Borno', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics'], phone: '+2348045678903', website: null, has_emergency: true, is_onboarded: false },

  // Cross River
  { name: 'University of Calabar Teaching Hospital', city: 'Calabar', state: 'Cross River', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'oncology'], phone: '+2348056789014', website: 'https://ucth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'General Hospital Calabar', city: 'Calabar', state: 'Cross River', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+2348067890125', website: null, has_emergency: true, is_onboarded: false },

  // Delta
  { name: 'Delta State University Teaching Hospital', city: 'Oghara', state: 'Delta', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+2348078901236', website: 'https://delsuth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Central Hospital Warri', city: 'Warri', state: 'Delta', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics', 'paediatrics'], phone: '+2348089012347', website: null, has_emergency: true, is_onboarded: false },

  // Ebonyi
  { name: 'Alex Ekwueme Federal University Teaching Hospital', city: 'Abakaliki', state: 'Ebonyi', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+2348090123458', website: 'https://aefuth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Federal Teaching Hospital Abakaliki', city: 'Abakaliki', state: 'Ebonyi', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'paediatrics'], phone: '+2348012345679', website: null, has_emergency: true, is_onboarded: false },

  // Edo
  { name: 'University of Benin Teaching Hospital', city: 'Benin City', state: 'Edo', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'cardiology', 'neurology'], phone: '+2348023456780', website: 'https://ubth.org', has_emergency: true, is_onboarded: false },
  { name: 'Central Hospital Benin City', city: 'Benin City', state: 'Edo', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics', 'paediatrics'], phone: '+2348034567891', website: null, has_emergency: true, is_onboarded: false },

  // Ekiti
  { name: 'Ekiti State University Teaching Hospital', city: 'Ado Ekiti', state: 'Ekiti', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+2348045678902', website: 'https://eksuth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Federal Teaching Hospital Ido-Ekiti', city: 'Ido Ekiti', state: 'Ekiti', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'paediatrics'], phone: '+2348056789013', website: null, has_emergency: true, is_onboarded: false },

  // Enugu
  { name: 'University of Nigeria Teaching Hospital', city: 'Enugu', state: 'Enugu', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'oncology', 'cardiology'], phone: '+2348067890124', website: 'https://unth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Enugu State University Teaching Hospital', city: 'Enugu', state: 'Enugu', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'paediatrics', 'psychiatry'], phone: '+2348078901235', website: null, has_emergency: true, is_onboarded: false },

  // FCT / Abuja
  { name: 'National Hospital Abuja', city: 'Abuja', state: 'FCT', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'cardiology', 'neurology', 'oncology'], phone: '+2348089012346', website: 'https://nationalhospital.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'University of Abuja Teaching Hospital', city: 'Gwagwalada', state: 'FCT', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+2348090123457', website: 'https://uath.gov.ng', has_emergency: true, is_onboarded: false },

  // Gombe
  { name: 'Federal Teaching Hospital Gombe', city: 'Gombe', state: 'Gombe', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+2348012345670', website: 'https://fthgombe.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Specialist Hospital Gombe', city: 'Gombe', state: 'Gombe', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+2348023456782', website: null, has_emergency: true, is_onboarded: false },

  // Imo
  { name: 'Federal Medical Centre Owerri', city: 'Owerri', state: 'Imo', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+2348034567893', website: 'https://fmcowerri.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Imo State University Teaching Hospital', city: 'Orlu', state: 'Imo', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'obstetrics'], phone: '+2348045678904', website: null, has_emergency: true, is_onboarded: false },

  // Jigawa
  { name: 'Federal Medical Centre Birnin-Kudu', city: 'Birnin Kudu', state: 'Jigawa', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics'], phone: '+2348056789015', website: 'https://fmcbirinkudu.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Rasheed Shekoni Specialist Hospital', city: 'Dutse', state: 'Jigawa', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+2348067890126', website: null, has_emergency: true, is_onboarded: false },

  // Kaduna
  { name: 'Ahmadu Bello University Teaching Hospital', city: 'Zaria', state: 'Kaduna', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'cardiology', 'neurology'], phone: '+2348078901237', website: 'https://abuth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Barau Dikko Teaching Hospital', city: 'Kaduna', state: 'Kaduna', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'paediatrics', 'obstetrics'], phone: '+2348089012348', website: null, has_emergency: true, is_onboarded: false },

  // Kano
  { name: 'Aminu Kano Teaching Hospital', city: 'Kano', state: 'Kano', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'cardiology', 'oncology', 'neurology'], phone: '+2348090123459', website: 'https://akth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Murtala Mohammed Specialist Hospital', city: 'Kano', state: 'Kano', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics', 'paediatrics'], phone: '+2348012345671', website: null, has_emergency: true, is_onboarded: false },

  // Katsina
  { name: 'Federal Medical Centre Katsina', city: 'Katsina', state: 'Katsina', type: 'public', tier: 2, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+2348023456783', website: 'https://fmckatsina.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Turai Umaru Musa Yar\'Adua Specialist Hospital', city: 'Katsina', state: 'Katsina', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+2348034567894', website: null, has_emergency: true, is_onboarded: false },

  // Kebbi
  { name: 'Federal Medical Centre Birnin Kebbi', city: 'Birnin Kebbi', state: 'Kebbi', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics'], phone: '+2348045678905', website: 'https://fmcbirnikebbi.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Specialist Hospital Kebbi', city: 'Birnin Kebbi', state: 'Kebbi', type: 'public', tier: 2, specialties: ['general practice', 'paediatrics'], phone: '+2348056789016', website: null, has_emergency: false, is_onboarded: false },

  // Kogi
  { name: 'Federal Medical Centre Lokoja', city: 'Lokoja', state: 'Kogi', type: 'public', tier: 2, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+2348067890127', website: 'https://fmclokoja.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Kogi State Specialist Hospital', city: 'Lokoja', state: 'Kogi', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+2348078901238', website: null, has_emergency: true, is_onboarded: false },

  // Kwara
  { name: 'University of Ilorin Teaching Hospital', city: 'Ilorin', state: 'Kwara', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'cardiology', 'paediatrics'], phone: '+2348089012349', website: 'https://uith.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'General Hospital Ilorin', city: 'Ilorin', state: 'Kwara', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics'], phone: '+2348090123460', website: null, has_emergency: true, is_onboarded: false },

  // Lagos
  { name: 'Lagos University Teaching Hospital', city: 'Lagos', state: 'Lagos', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'cardiology', 'oncology', 'neurology', 'urology'], phone: '+2348012345672', website: 'https://luth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Lagos Island General Hospital', city: 'Lagos Island', state: 'Lagos', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics', 'paediatrics', 'urology'], phone: '+2348023456784', website: null, has_emergency: true, is_onboarded: false },

  // Nasarawa
  { name: 'Dalhatu Araf Specialist Hospital', city: 'Lafia', state: 'Nasarawa', type: 'public', tier: 2, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+2348034567895', website: null, has_emergency: true, is_onboarded: false },
  { name: 'Federal Medical Centre Keffi', city: 'Keffi', state: 'Nasarawa', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+2348045678906', website: 'https://fmckeffi.gov.ng', has_emergency: true, is_onboarded: false },

  // Niger
  { name: 'IBB Specialist Hospital Minna', city: 'Minna', state: 'Niger', type: 'public', tier: 2, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+2348056789017', website: null, has_emergency: true, is_onboarded: false },
  { name: 'Federal Medical Centre Bida', city: 'Bida', state: 'Niger', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+2348067890128', website: 'https://fmcbida.gov.ng', has_emergency: true, is_onboarded: false },

  // Ogun
  { name: 'Olabisi Onabanjo University Teaching Hospital', city: 'Sagamu', state: 'Ogun', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+2348078901239', website: 'https://oouth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Federal Medical Centre Abeokuta', city: 'Abeokuta', state: 'Ogun', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics'], phone: '+2348089012350', website: 'https://fmcabeokuta.gov.ng', has_emergency: true, is_onboarded: false },

  // Ondo
  { name: 'UNIMED Teaching Hospital', city: 'Ondo', state: 'Ondo', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+2348090123461', website: null, has_emergency: true, is_onboarded: false },
  { name: 'Federal Medical Centre Owo', city: 'Owo', state: 'Ondo', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+2348012345673', website: 'https://fmcowo.gov.ng', has_emergency: true, is_onboarded: false },

  // Osun
  { name: 'LAUTECH Teaching Hospital', city: 'Osogbo', state: 'Osun', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+2348023456785', website: 'https://lautechhospital.org', has_emergency: true, is_onboarded: false },
  { name: 'Obafemi Awolowo University Teaching Hospital', city: 'Ile-Ife', state: 'Osun', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'cardiology', 'neurology', 'oncology'], phone: '+2348034567896', website: 'https://oauthc.gov.ng', has_emergency: true, is_onboarded: false },

  // Oyo
  { name: 'University College Hospital Ibadan', city: 'Ibadan', state: 'Oyo', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'cardiology', 'oncology', 'neurology', 'psychiatry'], phone: '+2348045678907', website: 'https://uch-ibadan.org.ng', has_emergency: true, is_onboarded: false },
  { name: 'Ring Road State Hospital Ibadan', city: 'Ibadan', state: 'Oyo', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics', 'paediatrics'], phone: '+2348056789018', website: null, has_emergency: true, is_onboarded: false },

  // Plateau
  { name: 'Jos University Teaching Hospital', city: 'Jos', state: 'Plateau', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'haematology', 'paediatrics'], phone: '+2348067890129', website: 'https://juth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Bingham University Teaching Hospital', city: 'Jos', state: 'Plateau', type: 'private', tier: 3, specialties: ['internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+2348078901240', website: null, has_emergency: true, is_onboarded: false },

  // Rivers
  { name: 'University of Port Harcourt Teaching Hospital', city: 'Port Harcourt', state: 'Rivers', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'cardiology', 'neurology', 'urology'], phone: '+2348089012351', website: 'https://upth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Braithwaite Memorial Specialist Hospital', city: 'Port Harcourt', state: 'Rivers', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics', 'paediatrics'], phone: '+2348090123462', website: null, has_emergency: true, is_onboarded: false },

  // Sokoto
  { name: 'Usmanu Danfodiyo University Teaching Hospital', city: 'Sokoto', state: 'Sokoto', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+2348012345674', website: 'https://uduth.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Specialist Hospital Sokoto', city: 'Sokoto', state: 'Sokoto', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+2348023456786', website: null, has_emergency: true, is_onboarded: false },

  // Taraba
  { name: 'Federal Medical Centre Jalingo', city: 'Jalingo', state: 'Taraba', type: 'public', tier: 2, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+2348034567897', website: 'https://fmcjalingo.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Taraba State Specialist Hospital', city: 'Jalingo', state: 'Taraba', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+2348045678908', website: null, has_emergency: false, is_onboarded: false },

  // Yobe
  { name: 'Federal Medical Centre Nguru', city: 'Nguru', state: 'Yobe', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics'], phone: '+2348056789019', website: 'https://fmcnguru.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Specialist Hospital Damaturu', city: 'Damaturu', state: 'Yobe', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+2348067890130', website: null, has_emergency: true, is_onboarded: false },

  // Zamfara
  { name: 'Federal Medical Centre Gusau', city: 'Gusau', state: 'Zamfara', type: 'public', tier: 2, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+2348078901241', website: 'https://fmcgusau.gov.ng', has_emergency: true, is_onboarded: false },
  { name: 'Yariman Bakura Specialist Hospital', city: 'Gusau', state: 'Zamfara', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+2348089012352', website: null, has_emergency: false, is_onboarded: false },

  // ── INDIA ────────────────────────────────────────────────────────────────────
  // Andhra Pradesh
  { name: 'Narayana Medical College Hospital', city: 'Nellore', state: 'Andhra Pradesh', type: 'private', tier: 3, specialties: ['general practice', 'cardiology', 'oncology', 'neurology', 'surgery'], phone: '+918612312345', website: 'https://narayanahealth.org', has_emergency: true, is_onboarded: false },
  { name: 'Government General Hospital Vijayawada', city: 'Vijayawada', state: 'Andhra Pradesh', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+918662345678', website: null, has_emergency: true, is_onboarded: false },

  // Arunachal Pradesh
  { name: 'Tomo Riba Institute of Health & Medical Sciences', city: 'Naharlagun', state: 'Arunachal Pradesh', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+913602212345', website: null, has_emergency: true, is_onboarded: false },
  { name: 'District Hospital Itanagar', city: 'Itanagar', state: 'Arunachal Pradesh', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+913602234567', website: null, has_emergency: true, is_onboarded: false },

  // Assam
  { name: 'Gauhati Medical College & Hospital', city: 'Guwahati', state: 'Assam', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'neurology', 'oncology'], phone: '+916123456789', website: 'https://gmch.gov.in', has_emergency: true, is_onboarded: false },
  { name: 'AIIMS Guwahati', city: 'Guwahati', state: 'Assam', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'cardiology', 'neurology', 'oncology', 'paediatrics'], phone: '+916123567890', website: 'https://aiimsguwahati.ac.in', has_emergency: true, is_onboarded: false },

  // Bihar
  { name: 'Patna Medical College & Hospital', city: 'Patna', state: 'Bihar', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+916123678901', website: null, has_emergency: true, is_onboarded: false },
  { name: 'IGIMS Patna', city: 'Patna', state: 'Bihar', type: 'public', tier: 3, specialties: ['internal medicine', 'cardiology', 'surgery', 'neurology', 'oncology'], phone: '+916123789012', website: 'https://igims.org', has_emergency: true, is_onboarded: false },

  // Chhattisgarh
  { name: 'AIIMS Raipur', city: 'Raipur', state: 'Chhattisgarh', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'cardiology', 'oncology', 'neurology'], phone: '+917712234567', website: 'https://aiimsraipur.edu.in', has_emergency: true, is_onboarded: false },
  { name: 'Dr. Bhimrao Ambedkar Memorial Hospital', city: 'Raipur', state: 'Chhattisgarh', type: 'public', tier: 3, specialties: ['general practice', 'surgery', 'obstetrics', 'paediatrics'], phone: '+917712345678', website: null, has_emergency: true, is_onboarded: false },

  // Delhi
  { name: 'AIIMS New Delhi', city: 'New Delhi', state: 'Delhi', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'cardiology', 'oncology', 'neurology', 'urology', 'psychiatry'], phone: '+911126588500', website: 'https://aiims.edu', has_emergency: true, is_onboarded: false },
  { name: 'Safdarjung Hospital', city: 'New Delhi', state: 'Delhi', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics', 'burns'], phone: '+911126165060', website: 'https://vmmc-sjh.nic.in', has_emergency: true, is_onboarded: false },

  // Goa
  { name: 'Goa Medical College & Hospital', city: 'Panaji', state: 'Goa', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics', 'cardiology'], phone: '+918322458700', website: 'https://gmchgoa.edu.in', has_emergency: true, is_onboarded: false },
  { name: 'Manipal Hospital Goa', city: 'Panaji', state: 'Goa', type: 'private', tier: 3, specialties: ['cardiology', 'oncology', 'neurology', 'surgery', 'orthopaedics'], phone: '+918322459200', website: 'https://manipalhospitals.com', has_emergency: true, is_onboarded: false },

  // Gujarat
  { name: 'Civil Hospital Ahmedabad', city: 'Ahmedabad', state: 'Gujarat', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'cardiology', 'oncology'], phone: '+917912345678', website: null, has_emergency: true, is_onboarded: false },
  { name: 'UN Mehta Institute of Cardiology', city: 'Ahmedabad', state: 'Gujarat', type: 'public', tier: 3, specialties: ['cardiology', 'cardiac surgery', 'internal medicine'], phone: '+917912567890', website: 'https://unmicrc.org', has_emergency: true, is_onboarded: false },

  // Haryana
  { name: 'PGIMS Rohtak', city: 'Rohtak', state: 'Haryana', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'oncology', 'neurology'], phone: '+911262282750', website: 'https://pgims.ac.in', has_emergency: true, is_onboarded: false },
  { name: 'Medanta - The Medicity', city: 'Gurugram', state: 'Haryana', type: 'private', tier: 3, specialties: ['cardiology', 'oncology', 'neurology', 'surgery', 'transplant', 'orthopaedics'], phone: '+911244141414', website: 'https://medanta.org', has_emergency: true, is_onboarded: false },

  // Himachal Pradesh
  { name: 'Indira Gandhi Medical College Shimla', city: 'Shimla', state: 'Himachal Pradesh', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+911772804200', website: 'https://igmcshimla.edu.in', has_emergency: true, is_onboarded: false },
  { name: 'AIIMS Bilaspur', city: 'Bilaspur', state: 'Himachal Pradesh', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'cardiology', 'neurology'], phone: '+911978000100', website: 'https://aiimsbbsr.edu.in', has_emergency: true, is_onboarded: false },

  // Jammu & Kashmir
  { name: 'SKIMS Srinagar', city: 'Srinagar', state: 'Jammu & Kashmir', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'cardiology', 'oncology', 'neurology', 'obstetrics'], phone: '+919419014099', website: 'https://skims.ac.in', has_emergency: true, is_onboarded: false },
  { name: 'SMHS Hospital Srinagar', city: 'Srinagar', state: 'Jammu & Kashmir', type: 'public', tier: 3, specialties: ['general practice', 'surgery', 'obstetrics', 'paediatrics'], phone: '+919697000000', website: null, has_emergency: true, is_onboarded: false },

  // Jharkhand
  { name: 'Rajendra Institute of Medical Sciences', city: 'Ranchi', state: 'Jharkhand', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'oncology'], phone: '+916512545600', website: 'https://rimsranchi.ac.in', has_emergency: true, is_onboarded: false },
  { name: 'PMCH Dhanbad', city: 'Dhanbad', state: 'Jharkhand', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics', 'obstetrics'], phone: '+916512678900', website: null, has_emergency: true, is_onboarded: false },

  // Karnataka
  { name: 'Manipal Hospital Bangalore', city: 'Bengaluru', state: 'Karnataka', type: 'private', tier: 3, specialties: ['cardiology', 'oncology', 'neurology', 'surgery', 'transplant', 'urology'], phone: '+918023456789', website: 'https://manipalhospitals.com', has_emergency: true, is_onboarded: false },
  { name: 'St. John\'s Medical College Hospital', city: 'Bengaluru', state: 'Karnataka', type: 'private', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics', 'psychiatry'], phone: '+918022065000', website: 'https://stjohns.in', has_emergency: true, is_onboarded: false },

  // Kerala
  { name: 'Amrita Institute of Medical Sciences', city: 'Kochi', state: 'Kerala', type: 'private', tier: 3, specialties: ['cardiology', 'oncology', 'neurology', 'surgery', 'transplant', 'paediatrics'], phone: '+914842801234', website: 'https://amritahospitals.org', has_emergency: true, is_onboarded: false },
  { name: 'Medical Trust Hospital', city: 'Kochi', state: 'Kerala', type: 'private', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'cardiology'], phone: '+914842345678', website: 'https://medicaltrusthospital.com', has_emergency: true, is_onboarded: false },

  // Madhya Pradesh
  { name: 'AIIMS Bhopal', city: 'Bhopal', state: 'Madhya Pradesh', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'cardiology', 'oncology', 'neurology'], phone: '+917552672355', website: 'https://aiimsbhopal.edu.in', has_emergency: true, is_onboarded: false },
  { name: 'Hamidia Hospital', city: 'Bhopal', state: 'Madhya Pradesh', type: 'public', tier: 3, specialties: ['general practice', 'surgery', 'obstetrics', 'paediatrics', 'burns'], phone: '+917552540220', website: null, has_emergency: true, is_onboarded: false },

  // Maharashtra
  { name: 'Tata Memorial Hospital', city: 'Mumbai', state: 'Maharashtra', type: 'public', tier: 3, specialties: ['oncology', 'surgery', 'haematology', 'radiation oncology', 'paediatric oncology'], phone: '+912224177000', website: 'https://tmc.gov.in', has_emergency: true, is_onboarded: false },
  { name: 'King Edward Memorial Hospital', city: 'Mumbai', state: 'Maharashtra', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics', 'burns'], phone: '+912224136051', website: null, has_emergency: true, is_onboarded: false },

  // Manipur
  { name: 'Regional Institute of Medical Sciences', city: 'Imphal', state: 'Manipur', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+913852414161', website: 'https://rimsimphal.edu.in', has_emergency: true, is_onboarded: false },
  { name: 'Shija Hospitals & Research Institute', city: 'Imphal', state: 'Manipur', type: 'private', tier: 3, specialties: ['surgery', 'cardiology', 'orthopaedics', 'neurology'], phone: '+913852312345', website: 'https://shijahospitals.com', has_emergency: true, is_onboarded: false },

  // Meghalaya
  { name: 'NEIGRIHMS Shillong', city: 'Shillong', state: 'Meghalaya', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'oncology', 'neurology'], phone: '+913642538025', website: 'https://neigrihms.gov.in', has_emergency: true, is_onboarded: false },
  { name: 'Civil Hospital Shillong', city: 'Shillong', state: 'Meghalaya', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics', 'obstetrics'], phone: '+913642223456', website: null, has_emergency: true, is_onboarded: false },

  // Mizoram
  { name: 'Zoram Medical College & Hospital', city: 'Falkawn', state: 'Mizoram', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+913892312345', website: null, has_emergency: true, is_onboarded: false },
  { name: 'Civil Hospital Aizawl', city: 'Aizawl', state: 'Mizoram', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+913892334567', website: null, has_emergency: true, is_onboarded: false },

  // Nagaland
  { name: 'Naga Hospital Authority Kohima', city: 'Kohima', state: 'Nagaland', type: 'public', tier: 2, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics'], phone: '+917005312345', website: null, has_emergency: true, is_onboarded: false },
  { name: 'Baptist Hospital Dimapur', city: 'Dimapur', state: 'Nagaland', type: 'private', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics', 'obstetrics'], phone: '+913862234567', website: 'https://baptisthospitalnagaland.in', has_emergency: true, is_onboarded: false },

  // Odisha
  { name: 'SCB Medical College & Hospital', city: 'Cuttack', state: 'Odisha', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'haematology', 'oncology'], phone: '+916712412390', website: 'https://scbmch.nic.in', has_emergency: true, is_onboarded: false },
  { name: 'AIIMS Bhubaneswar', city: 'Bhubaneswar', state: 'Odisha', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'cardiology', 'neurology', 'oncology', 'paediatrics'], phone: '+916742476789', website: 'https://aiimsbhubaneswar.nic.in', has_emergency: true, is_onboarded: false },

  // Punjab
  { name: 'Dayanand Medical College & Hospital', city: 'Ludhiana', state: 'Punjab', type: 'private', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'cardiology', 'oncology', 'transplant'], phone: '+911612302345', website: 'https://dmch.edu.in', has_emergency: true, is_onboarded: false },
  { name: 'Government Medical College Amritsar', city: 'Amritsar', state: 'Punjab', type: 'public', tier: 3, specialties: ['general practice', 'surgery', 'obstetrics', 'paediatrics', 'neurology'], phone: '+911832256123', website: null, has_emergency: true, is_onboarded: false },

  // Rajasthan
  { name: 'SMS Medical College & Hospital', city: 'Jaipur', state: 'Rajasthan', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'cardiology', 'oncology', 'neurology'], phone: '+911412560291', website: 'https://smshospital.rajasthan.gov.in', has_emergency: true, is_onboarded: false },
  { name: 'Fortis Escorts Hospital Jaipur', city: 'Jaipur', state: 'Rajasthan', type: 'private', tier: 3, specialties: ['cardiology', 'cardiac surgery', 'neurology', 'orthopaedics', 'oncology'], phone: '+911414254000', website: 'https://fortishealthcare.com', has_emergency: true, is_onboarded: false },

  // Sikkim
  { name: 'STNM Hospital Gangtok', city: 'Gangtok', state: 'Sikkim', type: 'public', tier: 2, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+913592202349', website: null, has_emergency: true, is_onboarded: false },
  { name: 'Sikkim Manipal Institute of Medical Sciences', city: 'Gangtok', state: 'Sikkim', type: 'private', tier: 3, specialties: ['general practice', 'surgery', 'obstetrics', 'cardiology', 'paediatrics'], phone: '+913592270000', website: 'https://smims.smu.ac.in', has_emergency: true, is_onboarded: false },

  // Tamil Nadu
  { name: 'Christian Medical College Vellore', city: 'Vellore', state: 'Tamil Nadu', type: 'private', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'cardiology', 'oncology', 'transplant', 'neurology', 'haematology'], phone: '+914162282010', website: 'https://cmch-vellore.edu', has_emergency: true, is_onboarded: false },
  { name: 'Apollo Hospitals Chennai', city: 'Chennai', state: 'Tamil Nadu', type: 'private', tier: 3, specialties: ['cardiology', 'oncology', 'neurology', 'surgery', 'transplant', 'orthopaedics', 'urology'], phone: '+914428290200', website: 'https://apollohospitals.com', has_emergency: true, is_onboarded: false },

  // Telangana
  { name: 'Yashoda Hospitals Hyderabad', city: 'Hyderabad', state: 'Telangana', type: 'private', tier: 3, specialties: ['cardiology', 'oncology', 'neurology', 'surgery', 'transplant', 'orthopaedics'], phone: '+914023456789', website: 'https://yashodahospitals.com', has_emergency: true, is_onboarded: false },
  { name: 'Nizam\'s Institute of Medical Sciences', city: 'Hyderabad', state: 'Telangana', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'cardiology', 'neurology', 'oncology', 'urology'], phone: '+914023489000', website: 'https://nims.telangana.gov.in', has_emergency: true, is_onboarded: false },

  // Tripura
  { name: 'GB Pant Hospital Agartala', city: 'Agartala', state: 'Tripura', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+913812324000', website: null, has_emergency: true, is_onboarded: false },
  { name: 'AGMC & GBP Hospital', city: 'Agartala', state: 'Tripura', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'oncology', 'cardiology'], phone: '+913812412345', website: null, has_emergency: true, is_onboarded: false },

  // Uttar Pradesh
  { name: 'SGPGI Lucknow', city: 'Lucknow', state: 'Uttar Pradesh', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'cardiology', 'neurology', 'oncology', 'transplant', 'urology'], phone: '+915222668700', website: 'https://sgpgi.ac.in', has_emergency: true, is_onboarded: false },
  { name: 'King George\'s Medical University', city: 'Lucknow', state: 'Uttar Pradesh', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics', 'psychiatry', 'cardiology'], phone: '+915222257539', website: 'https://kgmu.org', has_emergency: true, is_onboarded: false },

  // Uttarakhand
  { name: 'AIIMS Rishikesh', city: 'Rishikesh', state: 'Uttarakhand', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'cardiology', 'oncology', 'neurology'], phone: '+911352462994', website: 'https://aiimsrishikesh.edu.in', has_emergency: true, is_onboarded: false },
  { name: 'Himalayan Institute of Medical Sciences', city: 'Dehradun', state: 'Uttarakhand', type: 'private', tier: 3, specialties: ['general practice', 'surgery', 'obstetrics', 'cardiology', 'orthopaedics'], phone: '+911352471200', website: 'https://himsr.ac.in', has_emergency: true, is_onboarded: false },

  // West Bengal
  { name: 'IPGMER & SSKM Hospital', city: 'Kolkata', state: 'West Bengal', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'cardiology', 'neurology', 'oncology', 'haematology'], phone: '+913322044444', website: null, has_emergency: true, is_onboarded: false },
  { name: 'Medical College Kolkata', city: 'Kolkata', state: 'West Bengal', type: 'public', tier: 3, specialties: ['general practice', 'surgery', 'obstetrics', 'paediatrics', 'psychiatry'], phone: '+913322556000', website: null, has_emergency: true, is_onboarded: false },

  // Chandigarh (UT)
  { name: 'PGIMER Chandigarh', city: 'Chandigarh', state: 'Chandigarh', type: 'public', tier: 3, specialties: ['internal medicine', 'surgery', 'cardiology', 'neurology', 'oncology', 'transplant', 'paediatrics', 'haematology'], phone: '+911722756565', website: 'https://pgimer.edu.in', has_emergency: true, is_onboarded: false },
  { name: 'Government Medical College Chandigarh', city: 'Chandigarh', state: 'Chandigarh', type: 'public', tier: 3, specialties: ['general practice', 'surgery', 'obstetrics', 'paediatrics'], phone: '+911722665253', website: null, has_emergency: true, is_onboarded: false },

  // Puducherry (UT)
  { name: 'JIPMER Puducherry', city: 'Puducherry', state: 'Puducherry', type: 'public', tier: 3, specialties: ['general practice', 'internal medicine', 'surgery', 'cardiology', 'oncology', 'neurology', 'obstetrics'], phone: '+914132272380', website: 'https://jipmer.edu.in', has_emergency: true, is_onboarded: false },
  { name: 'MGMCRI Puducherry', city: 'Puducherry', state: 'Puducherry', type: 'private', tier: 3, specialties: ['general practice', 'surgery', 'obstetrics', 'paediatrics', 'cardiology'], phone: '+914132615449', website: 'https://mgmcri.ac.in', has_emergency: true, is_onboarded: false },

  // Andaman & Nicobar (UT)
  { name: 'GB Pant Hospital Port Blair', city: 'Port Blair', state: 'Andaman and Nicobar Islands', type: 'public', tier: 2, specialties: ['general practice', 'internal medicine', 'surgery', 'obstetrics', 'paediatrics'], phone: '+913192232102', website: null, has_emergency: true, is_onboarded: false },
  { name: 'Naval Hospital Dhanvantari', city: 'Port Blair', state: 'Andaman and Nicobar Islands', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics'], phone: '+913192233456', website: null, has_emergency: true, is_onboarded: false },

  // Ladakh (UT)
  { name: 'SNM Hospital Leh', city: 'Leh', state: 'Ladakh', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics', 'internal medicine'], phone: '+911982252012', website: null, has_emergency: true, is_onboarded: false },
  { name: 'District Hospital Kargil', city: 'Kargil', state: 'Ladakh', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+911985232456', website: null, has_emergency: true, is_onboarded: false },

  // Lakshadweep (UT)
  { name: 'Indira Gandhi Hospital Kavaratti', city: 'Kavaratti', state: 'Lakshadweep', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics'], phone: '+914896262012', website: null, has_emergency: true, is_onboarded: false },
  { name: 'Community Health Centre Agatti', city: 'Agatti', state: 'Lakshadweep', type: 'public', tier: 1, specialties: ['general practice', 'obstetrics'], phone: '+914896244123', website: null, has_emergency: false, is_onboarded: false },

  // Dadra & Nagar Haveli (UT)
  { name: 'Government Hospital Silvassa', city: 'Silvassa', state: 'Dadra and Nagar Haveli', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'obstetrics', 'paediatrics'], phone: '+910260264012', website: null, has_emergency: true, is_onboarded: false },
  { name: 'District Hospital Daman', city: 'Daman', state: 'Dadra and Nagar Haveli', type: 'public', tier: 2, specialties: ['general practice', 'surgery', 'paediatrics'], phone: '+910260255678', website: null, has_emergency: true, is_onboarded: false },
];

// Nigerian states/territories
const NG_STATES = new Set([
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo',
  'Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa',
  'Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara',
]);

async function seed() {
  console.log(`Seeding ${HOSPITALS.length} hospitals...`);

  // Insert in batches of 20 to avoid request size limits
  const BATCH = 20;
  let inserted = 0;

  for (let i = 0; i < HOSPITALS.length; i += BATCH) {
    const batch = HOSPITALS.slice(i, i + BATCH).map((h) => ({
      ...h,
      is_active: true,
      country: NG_STATES.has(h.state) ? 'NG' : 'IN',
      admin1: h.state,
    }));
    const { error } = await supabase.from('hospitals_directory').insert(batch);
    if (error) {
      console.error(`Batch ${i / BATCH + 1} failed:`, error.message);
      process.exit(1);
    }
    inserted += batch.length;
    console.log(`  inserted ${inserted}/${HOSPITALS.length}`);
  }

  console.log('Done.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
