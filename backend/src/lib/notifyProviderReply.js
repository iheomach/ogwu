'use strict';

const supabase = require('./supabase');
const { sendPushAndHandleExpiry } = require('./expoPush');

function startProviderReplyNotifier() {
  supabase
    .channel('provider-reply-notifier')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'consult_messages' },
      async (payload) => {
        const msg = payload.new;
        if (msg?.sender_role !== 'provider') return;

        try {
          const { data: thread } = await supabase
            .from('consult_threads')
            .select('patient_id')
            .eq('id', msg.thread_id)
            .maybeSingle();

          if (!thread?.patient_id) return;

          const { data: profile } = await supabase
            .from('profiles')
            .select('push_token')
            .eq('id', thread.patient_id)
            .maybeSingle();

          if (!profile?.push_token) return;

          const preview = typeof msg.body === 'string' ? msg.body.slice(0, 100) : 'You have a new message from your care team.';

          await sendPushAndHandleExpiry({
            supabase,
            patientId: thread.patient_id,
            token: profile.push_token,
            title: 'New reply on your consult',
            body: preview,
            data: { thread_id: msg.thread_id },
          });

          console.log(`[notify] Push sent — patient ${thread.patient_id}, thread ${msg.thread_id}`);
        } catch (err) {
          console.warn('[notify] Provider reply notification error:', err.message);
        }
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[notify] Listening for provider replies');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[notify] Realtime channel status:', status);
      }
    });
}

module.exports = { startProviderReplyNotifier };
