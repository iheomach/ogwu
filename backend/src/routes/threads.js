const express = require('express');
const router = express.Router();

const supabase = require('../lib/supabase');
const authenticate = require('../middleware/auth');

function safeText(s, maxLen) {
  const out = typeof s === 'string' ? s.trim() : '';
  return out.length > maxLen ? out.slice(0, maxLen) : out;
}

function pickProviderType({ doctor_id, external_provider }) {
  if (doctor_id) return 'onboarded';
  if (external_provider) return 'external';
  return null;
}

async function snapshotLatestIntake(userId) {
  const { data, error } = await supabase
    .from('triage_intakes')
    .select('locale, answers, urgency, summary, safety_note, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    locale: data.locale ?? null,
    urgency: data.urgency ?? 'routine',
    summary: data.summary ?? null,
    safety_note: data.safety_note ?? null,
    answers: Array.isArray(data.answers) ? data.answers : [],
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

// List threads for current patient
router.get('/', authenticate, async (req, res) => {
  try {
    // Try embedding doctor info, but fail open if joins aren't supported.
    const withJoin = await supabase
      .from('consult_threads')
      .select(
        'id, patient_id, provider_type, doctor_id, external_provider, locale, urgency, status, created_at, updated_at, doctor:doctors(id, name, primary_specialty, hospital_name, location)'
      )
      .eq('patient_id', req.user.id)
      .order('created_at', { ascending: false });

    if (!withJoin.error) {
      return res.json({ threads: withJoin.data ?? [] });
    }

    const fallback = await supabase
      .from('consult_threads')
      .select('id, patient_id, provider_type, doctor_id, external_provider, locale, urgency, status, created_at, updated_at')
      .eq('patient_id', req.user.id)
      .order('created_at', { ascending: false });

    if (fallback.error) return res.status(400).json({ error: fallback.error.message });
    return res.json({ threads: fallback.data ?? [] });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to load consult threads' });
  }
});

// Create a thread (no payments; minimal async consult)
router.post('/', authenticate, async (req, res) => {
  try {
    const doctor_id = req.body?.doctor_id ? String(req.body.doctor_id) : null;
    const external_provider = req.body?.external_provider && typeof req.body.external_provider === 'object'
      ? req.body.external_provider
      : null;

    const provider_type = pickProviderType({ doctor_id, external_provider });
    if (!provider_type) {
      return res.status(400).json({ error: 'doctor_id or external_provider is required' });
    }

    const intake = await snapshotLatestIntake(req.user.id);

    const locale = intake?.locale ?? null;
    const urgency = intake?.urgency ?? 'routine';

    const { data, error } = await supabase
      .from('consult_threads')
      .insert({
        patient_id: req.user.id,
        provider_type,
        doctor_id,
        external_provider,
        locale,
        urgency,
        intake_snapshot: intake,
        status: 'open',
      })
      .select(
        'id, patient_id, provider_type, doctor_id, external_provider, locale, urgency, status, created_at, updated_at'
      )
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ thread: data });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to create consult thread' });
  }
});

// List messages in a thread
router.get('/:id/messages', authenticate, async (req, res) => {
  try {
    const threadId = String(req.params.id);

    // Ensure ownership
    const { data: thread, error: threadError } = await supabase
      .from('consult_threads')
      .select('id')
      .eq('id', threadId)
      .eq('patient_id', req.user.id)
      .maybeSingle();

    if (threadError) return res.status(400).json({ error: threadError.message });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const { data, error } = await supabase
      .from('consult_messages')
      .select('id, thread_id, sender_role, body, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ messages: data ?? [] });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to load messages' });
  }
});

// Send a message as patient
router.post('/:id/messages', authenticate, async (req, res) => {
  try {
    const threadId = String(req.params.id);
    const body = safeText(req.body?.body, 4000);
    if (!body) return res.status(400).json({ error: 'Message body is required' });

    // Ensure ownership
    const { data: thread, error: threadError } = await supabase
      .from('consult_threads')
      .select('id, status')
      .eq('id', threadId)
      .eq('patient_id', req.user.id)
      .maybeSingle();

    if (threadError) return res.status(400).json({ error: threadError.message });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    if (thread.status !== 'open') return res.status(400).json({ error: 'Thread is closed' });

    const { data, error } = await supabase
      .from('consult_messages')
      .insert({
        thread_id: threadId,
        sender_role: 'patient',
        body,
      })
      .select('id, thread_id, sender_role, body, created_at')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ message: data });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to send message' });
  }
});

module.exports = router;
