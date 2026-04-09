const express = require('express');
const crypto = require('crypto');
const { google } = require('googleapis');

const router = express.Router();

const authenticate = require('../middleware/auth');
const supabase = require('../lib/supabase');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function getOAuthClient() {
  const clientId = requireEnv('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_OAUTH_CLIENT_SECRET');
  const redirectUri = requireEnv('GOOGLE_OAUTH_REDIRECT_URI');
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function isAdmin(user) {
  const role = user?.user_metadata?.role || user?.app_metadata?.role;
  return role === 'admin';
}

// Step 1: Admin initiates OAuth for the clinic Google account.
router.get('/connect', authenticate, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'admin only' });

    const oauth2Client = getOAuthClient();

    const state = crypto.randomBytes(16).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    // Store state server-side to validate callback.
    const { error: upsertErr } = await supabase.from('integration_tokens').upsert(
      {
        provider: 'google_calendar',
        meta: { oauth_state: state, oauth_state_expires_at: expiresAt },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider' }
    );
    if (upsertErr) return res.status(500).json({ error: upsertErr.message });

    const scopes = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      state,
    });

    return res.json({ auth_url: authUrl });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Failed to start Google OAuth' });
  }
});

// Step 2: OAuth callback; exchanges code for tokens and stores refresh token.
// This endpoint is intended to be visited by the admin in a browser.
router.get('/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    if (!code || !state) return res.status(400).send('Missing code/state');

    const { data: tokenRow, error: readErr } = await supabase
      .from('integration_tokens')
      .select('provider, meta')
      .eq('provider', 'google_calendar')
      .maybeSingle();

    if (readErr) return res.status(500).send(readErr.message);

    const expectedState = tokenRow?.meta?.oauth_state;
    const expiresAt = tokenRow?.meta?.oauth_state_expires_at;

    if (!expectedState || expectedState !== state) {
      return res.status(400).send('Invalid OAuth state');
    }

    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      return res.status(400).send('OAuth state expired; please reconnect');
    }

    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    // Optional: fetch profile email for display/debug.
    oauth2Client.setCredentials(tokens);
    let connectedEmail = null;
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const me = await oauth2.userinfo.get();
      connectedEmail = me?.data?.email || null;
    } catch {
      // ignore
    }

    const meta = {
      ...(tokenRow?.meta || {}),
      oauth_state: null,
      oauth_state_expires_at: null,
      connected_email: connectedEmail,
      calendar_id: process.env.GOOGLE_CLINIC_CALENDAR_ID || 'primary',
    };

    const { error: writeErr } = await supabase.from('integration_tokens').upsert(
      {
        provider: 'google_calendar',
        access_token: tokens.access_token || null,
        refresh_token: tokens.refresh_token || null,
        scope: tokens.scope || null,
        token_type: tokens.token_type || null,
        expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        meta,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider' }
    );

    if (writeErr) return res.status(500).send(writeErr.message);

    return res
      .status(200)
      .send(
        `Google Calendar connected${connectedEmail ? ` for ${connectedEmail}` : ''}. You can close this tab.`
      );
  } catch (e) {
    return res.status(500).send(e?.message || 'Failed to complete Google OAuth');
  }
});

module.exports = router;
