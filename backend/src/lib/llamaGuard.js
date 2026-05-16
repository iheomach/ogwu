const CATEGORIES = `S1: Violent Crimes.
S2: Non-Violent Crimes.
S3: Sex-Related Crimes.
S4: Child Sexual Exploitation.
S5: Defamation.
S6: Specialized Advice. Providing dangerous or misleading medical, legal, or financial guidance.
S7: Privacy.
S8: Intellectual Property.
S9: Indiscriminate Weapons.
S10: Hate.
S11: Suicide & Self-Harm.
S12: Sexual Content.
S13: Elections.`;

// Shown to patient when their own message is blocked
const INPUT_SAFE_FALLBACK = "I'm not able to assist with that. If you have a health concern, please describe your symptoms and I'll do my best to help.";

// Shown to patient when the agent's response is blocked
const OUTPUT_SAFE_FALLBACK = "I wasn't able to send a safe response. Please contact your healthcare provider directly, or call 911 if this is an emergency.";

function buildPrompt(turns, checkRole) {
  const conversation = turns
    .map((t) => `${t.role === 'user' ? 'User' : 'Agent'}: ${t.content}`)
    .join('\n\n');

  return `Task: Check if there is unsafe content in '${checkRole}' messages in conversations according to our safety policy with the below categories.

<BEGIN UNSAFE CONTENT CATEGORIES>
${CATEGORIES}
<END UNSAFE CONTENT CATEGORIES>

<BEGIN CONVERSATION>

${conversation}

<END CONVERSATION>

Provide your safety assessment for ONLY THE LAST ${checkRole} message in the above conversation:
 - First line must read 'safe' or 'unsafe'.
 - If unsafe, a second line must include a comma-separated list of violated categories.`;
}

async function checkWithLlamaGuard(turns, checkRole = 'Agent') {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn('[llamaGuard] GROQ_API_KEY not set — skipping');
    return { safe: true, category: null };
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-safeguard-20b',
        messages: [{ role: 'user', content: buildPrompt(turns, checkRole) }],
        max_tokens: 20,
        temperature: 0,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[llamaGuard] HTTP error:', res.status, body);
      return { safe: true, category: null };
    }

    const data = await res.json();
    const text = (data.choices?.[0]?.message?.content ?? '').trim().toLowerCase();

    if (text.startsWith('unsafe')) {
      const category = text.split('\n')[1]?.trim() ?? null;
      return { safe: false, category };
    }
    return { safe: true, category: null };
  } catch (err) {
    console.error('[llamaGuard] error — failing open:', err?.message);
    return { safe: true, category: null };
  }
}

module.exports = { checkWithLlamaGuard, INPUT_SAFE_FALLBACK, OUTPUT_SAFE_FALLBACK };
