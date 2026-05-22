'use strict';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendExpoPush({ token, title, body, data = {} }) {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: token, title, body, data, sound: 'default' }),
  });

  if (!res.ok) throw new Error(`Expo Push ${res.status}: ${await res.text()}`);
  return res.json();
}

// Sends push and clears the token from profiles on DeviceNotRegistered.
async function sendPushAndHandleExpiry({ supabase, patientId, token, title, body, data }) {
  try {
    const result = await sendExpoPush({ token, title, body, data });
    const detail = result?.data;
    if (detail?.status === 'error' && detail?.details?.error === 'DeviceNotRegistered') {
      console.warn(`[expoPush] DeviceNotRegistered — clearing token for patient ${patientId}`);
      await supabase
        .from('profiles')
        .update({ push_token: null, push_token_updated_at: new Date().toISOString() })
        .eq('id', patientId);
    }
    return result;
  } catch (err) {
    console.warn(`[expoPush] send failed for patient ${patientId}: ${err.message}`);
    return null;
  }
}

module.exports = { sendExpoPush, sendPushAndHandleExpiry };
