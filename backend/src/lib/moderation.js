const OpenAI = require('openai');

let _client = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

const SAFE_FALLBACK = "I'm sorry, I wasn't able to send a response. Please contact your healthcare provider directly, or call 911 if this is an emergency.";

async function moderateText(text) {
  if (!text || !text.trim()) return { flagged: false };
  try {
    const response = await getClient().moderations.create({
      model: 'omni-moderation-latest',
      input: text,
    });
    return response.results[0] ?? { flagged: false };
  } catch (err) {
    console.error('[moderation] API error — failing open:', err?.message);
    return { flagged: false };
  }
}

module.exports = { moderateText, SAFE_FALLBACK };
