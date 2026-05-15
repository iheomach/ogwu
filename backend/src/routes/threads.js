const serverError = require('../lib/serverError');
const express = require('express');
const router = express.Router();

const { generateText } = require('ai');
const { openai } = require('@ai-sdk/openai');
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/auth');
const { parseTriageUrgency } = require('../lib/urgency');

async function generateThreadTitle(intake) {
  // Build the best available description of the medical concern
  let concern = (intake?.summary ?? '').trim();
  if (!concern && Array.isArray(intake?.answers) && intake.answers.length > 0) {
    concern = intake.answers
      .filter(({ q, a }) => q && a)
      .map(({ q, a }) => `${q}: ${a}`)
      .join('. ');
  }
  if (!concern) return null;
  try {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      prompt: `Summarize this patient's medical concern in 6 words or fewer. Focus only on the clinical issue — no names, ages, or locations. Be direct and clinical. No punctuation at the end. Never use em dashes. Only output the summary, nothing else.\n\nConcern: ${concern}`,
      maxTokens: 24,
    });
    return text.trim().replace(/[.\n].*$/s, '').trim() || null;
  } catch (e) {
    console.error('Thread title generation failed:', e.message);
    return null;
  }
}

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
        'id, patient_id, provider_type, doctor_id, hospital_id, external_provider, locale, urgency, status, title, intake_snapshot, created_at, updated_at, doctor:doctors(id, name, primary_specialty, hospital_name, location)'
      )
      .eq('patient_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) return serverError(res, error, 'An error occurred.');

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

    // Backfill titles for old threads that never got one — fire-and-forget
    const untitled = enriched.filter(t => !t.title && t.intake_snapshot);
    if (untitled.length > 0) {
      Promise.all(
        untitled.map(async (t) => {
          const title = await generateThreadTitle(t.intake_snapshot);
          if (!title) return;
          await supabase.from('consult_threads').update({ title }).eq('id', t.id);
          t.title = title; // update in-place so this response already has the title
        })
      ).catch(() => {});
    }

    return res.json({ threads: enriched });
  } catch (err) {
    return serverError(res, err, 'Failed to load consult threads.');
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
    const urgency = parseTriageUrgency(intake?.urgency ?? 'routine');
    const title = await generateThreadTitle(intake);

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
        title,
        intake_snapshot: intake,
        status: 'open',
      })
      .select(
        'id, patient_id, provider_type, doctor_id, hospital_id, external_provider, locale, urgency, status, title, created_at, updated_at'
      )
      .single();

    if (error) return serverError(res, error, 'An error occurred.');

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
    return serverError(res, err, 'Failed to create consult thread.');
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

    if (error) return serverError(res, error, 'An error occurred.');
    return res.json({ messages: data ?? [] });
  } catch (err) {
    return serverError(res, err, 'Failed to load messages.');
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

    if (error) return serverError(res, error, 'An error occurred.');
    return res.status(201).json({ message: data });
  } catch (err) {
    return serverError(res, err, 'Failed to send message.');
  }
});

// Close a thread (patient only) — marks read-only + inserts system message
router.post('/:id/close', authenticate, async (req, res) => {
  try {
    const threadId = String(req.params.id);

    const { data: thread, error: threadError } = await supabase
      .from('consult_threads')
      .select('id, status, patient_id')
      .eq('id', threadId)
      .eq('patient_id', req.user.id)
      .maybeSingle();

    if (threadError) return res.status(400).json({ error: threadError.message });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    if (thread.status === 'closed') return res.status(400).json({ error: 'Thread is already closed' });

    const { data: updated, error: updateError } = await supabase
      .from('consult_threads')
      .update({ status: 'closed' })
      .eq('id', threadId)
      .select('id, status')
      .single();

    if (updateError) return res.status(400).json({ error: updateError.message });

    // Insert system message so both parties know who ended it
    await supabase.from('consult_messages').insert({
      thread_id: threadId,
      sender_role: 'system',
      body: 'This conversation was ended by the patient.',
    });

    return res.json({ thread: updated });
  } catch (err) {
    return serverError(res, err, 'Failed to close thread.');
  }
});

// Delete a thread (patient only, cascades messages)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const threadId = String(req.params.id);

    // Ensure ownership before deleting
    const { data: thread, error: threadError } = await supabase
      .from('consult_threads')
      .select('id')
      .eq('id', threadId)
      .eq('patient_id', req.user.id)
      .maybeSingle();

    if (threadError) return res.status(400).json({ error: threadError.message });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const { error } = await supabase
      .from('consult_threads')
      .delete()
      .eq('id', threadId);

    if (error) return serverError(res, error, 'An error occurred.');
    return res.status(200).json({ ok: true });
  } catch (err) {
    return serverError(res, err, 'Failed to delete thread.');
  }
});

module.exports = router;
