const express = require('express');
const router = express.Router();

const supabase = require('../lib/supabase');
const authenticate = require('../middleware/auth');

function safeText(s, maxLen) {
  const out = typeof s === 'string' ? s.trim() : '';
  return out.length > maxLen ? out.slice(0, maxLen) : out;
}

function formatIntakeSummaryMessage(intake) {
  if (!intake) return null;
  const urgencyLabel = { emergency: '🔴 Emergency', urgent: '🟠 Urgent', soon: '🟡 See soon', routine: '🟢 Routine' }[intake.urgency] ?? intake.urgency;
  const lines = [urgencyLabel];
  if (intake.summary) lines.push('\n' + intake.summary);
  if (Array.isArray(intake.answers) && intake.answers.length > 0) {
    lines.push('\nTriage responses:');
    for (const { q, a } of intake.answers) {
      if (q && a) lines.push(`• ${q}\n  → ${a}`);
    }
  }
  return lines.join('\n');
}

function pickProviderType({ doctor_id, hospital_id, external_provider }) {
  if (hospital_id) return 'hospital';
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
    const { data: threads, error } = await supabase
      .from('consult_threads')
      .select(
        'id, patient_id, provider_type, doctor_id, hospital_id, external_provider, locale, urgency, status, intake_snapshot, created_at, updated_at, doctor:doctors(id, name, primary_specialty, hospital_name, location)'
      )
      .eq('patient_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    // Enrich hospital threads with hospital name
    const hospitalIds = [...new Set((threads ?? []).filter(t => t.hospital_id).map(t => t.hospital_id))];
    let hospitalNames = {};
    if (hospitalIds.length > 0) {
      const { data: hospitals } = await supabase
        .from('hospitals_directory')
        .select('id, name')
        .in('id', hospitalIds);
      (hospitals ?? []).forEach(h => { hospitalNames[h.id] = h.name; });
    }

    const enriched = (threads ?? []).map(t => ({
      ...t,
      hospital_name: t.hospital_id ? (hospitalNames[t.hospital_id] ?? null) : null,
    }));

    return res.json({ threads: enriched });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to load consult threads' });
  }
});

// Create a thread (no payments; minimal async consult)
router.post('/', authenticate, async (req, res) => {
  try {
    const doctor_id = req.body?.doctor_id ? String(req.body.doctor_id) : null;
    const hospital_id = req.body?.hospital_id ? String(req.body.hospital_id) : null;
    const external_provider = req.body?.external_provider && typeof req.body.external_provider === 'object'
      ? req.body.external_provider
      : null;

    const provider_type = pickProviderType({ doctor_id, hospital_id, external_provider });
    if (!provider_type) {
      return res.status(400).json({ error: 'hospital_id, doctor_id, or external_provider is required' });
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
        hospital_id,
        external_provider,
        locale,
        urgency,
        intake_snapshot: intake,
        status: 'open',
      })
      .select(
        'id, patient_id, provider_type, doctor_id, hospital_id, external_provider, locale, urgency, status, created_at, updated_at'
      )
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Auto-insert health summary as the first message in the thread
    const summaryBody = formatIntakeSummaryMessage(intake);
    if (summaryBody) {
      await supabase.from('consult_messages').insert({
        thread_id: data.id,
        sender_role: 'patient',
        body: summaryBody,
      });
    }

    // Resolve hospital name if applicable
    let hospital_name = null;
    if (hospital_id) {
      const { data: hosp } = await supabase
        .from('hospitals_directory')
        .select('name')
        .eq('id', hospital_id)
        .maybeSingle();
      hospital_name = hosp?.name ?? null;
    }

    return res.status(201).json({ thread: { ...data, hospital_name } });
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
