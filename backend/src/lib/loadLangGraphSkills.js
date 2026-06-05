const path = require('path');
const { tool } = require('@langchain/core/tools');

const SKILLS_DIR = path.join(__dirname, '../skills');

const DESCRIPTIONS = {
  searchHospitals:
    'Search for hospitals near the patient. If GPS coordinates are available they are used automatically for Haversine distance ranking — just call this tool and the closest hospitals are returned. Pass state/city only as a fallback hint when GPS is unavailable. Returns hospitals sorted by proximity with is_onboarded flag. After calling this tool, send ONE short sentence to the patient and STOP — do NOT immediately call getHospitalBookingInfo. Wait for the patient to select a hospital before proceeding.',

  getHospitalBookingInfo:
    'After searchHospitals, call this for the best matching hospital. If is_onboarded=true, returns available Google Meet slots. If is_onboarded=false, returns a phone number and a ready-to-read call script in the `call_script` field, already personalised with the patient\'s name and complaint. You MUST copy the `call_script` value to the patient exactly as returned — never write your own version of the script.',

  bookAppointment:
    'Book a Google Meet appointment for an onboarded hospital. Only call this after the patient confirms a specific slot from getHospitalBookingInfo.',

  flagEmergency:
    'Flag a patient emergency. Call this immediately when symptoms suggest a life-threatening situation — before any other tool.',

  createConsult:
    'Save a structured consult record once the conversation is complete. Call this only as the very last action — after the patient has acknowledged the booking or phone script. Never call it mid-flow.',

  endConversation:
    "Ends the conversation and signals the app to show the patient a button to send their health summary to the hospital. Call this ONLY after the patient explicitly confirms they are done (e.g. \"yes\", \"sure\", \"go ahead\", \"ok\"). Pass the hospital_id and hospital_name from the bookAppointment result. Do not call this speculatively — wait for the patient's confirmation.",

  getPatientHistory:
    "Retrieve the patient's recent consult history. Use this when context from prior sessions is relevant to the current complaint.",
};

function loadLangGraphSkills(ctx) {
  return Object.entries(DESCRIPTIONS).map(([name, description]) => {
    const factory = require(path.join(SKILLS_DIR, `${name}.js`));
    const skill = factory(ctx);

    return tool(
      async (input) => {
        try {
          const result = await skill.execute(input);
          return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (err) {
          return JSON.stringify({ error: err?.message ?? 'Tool execution failed' });
        }
      },
      { name, description, schema: skill.inputSchema },
    );
  });
}

module.exports = { loadLangGraphSkills };
