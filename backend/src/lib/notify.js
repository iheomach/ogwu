const webpush = require('web-push');
const supabase = require('./supabase');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'alerts@ogwu.app'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

async function sendPush({ hospitalId, patientName, reason }) {
  if (!process.env.VAPID_PUBLIC_KEY) return;

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('hospital_id', hospitalId);

  if (!subs?.length) return;

  const payload = JSON.stringify({
    title: 'Emergency Alert',
    body: [patientName, reason].filter(Boolean).join(' — '),
  });

  await Promise.allSettled(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, payload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired — clean it up
          await supabase.from('push_subscriptions').delete().eq('id', row.id);
        } else {
          console.error('[notify] push failed:', err?.message);
        }
      }
    }),
  );
}

async function sendEmail({ hospitalId, patientName, reason }) {
  if (!process.env.RESEND_API_KEY) return;

  // Look up the hospital admin's email via auth.users
  const { data: hospital } = await supabase
    .from('hospitals_directory')
    .select('name, admin_user_id')
    .eq('id', hospitalId)
    .maybeSingle();

  if (!hospital?.admin_user_id) return;

  const { data: { user } } = await supabase.auth.admin.getUserById(hospital.admin_user_id);
  if (!user?.email) return;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Ogwu Alerts <alerts@ogwu.app>',
      to: [user.email],
      subject: `Emergency — ${patientName || 'Patient'}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#dc2626;margin-bottom:4px">Emergency Alert</h2>
          <p style="color:#6b7280;margin-top:0">${hospital.name}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
          <p><strong>Patient:</strong> ${patientName || 'Unknown'}</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p style="margin-top:24px;color:#6b7280;font-size:13px">
            Log in to the Ogwu dashboard to respond.
          </p>
        </div>
      `,
    }),
  });

  if (!res.ok) console.error('[notify] email failed:', res.status, await res.text());
}

async function notifyEmergency({ patientId, reason }) {
  if (!patientId) return;
  try {
    const { data: appt } = await supabase
      .from('appointments')
      .select('hospital_id')
      .eq('patient_id', patientId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const hospitalId = appt?.hospital_id ?? null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', patientId)
      .maybeSingle();

    const patientName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null;

    const { error } = await supabase
      .from('emergency_alerts')
      .insert({ patient_id: patientId, hospital_id: hospitalId, reason: reason ?? null });

    if (error) console.error('[notify] insert failed:', error.message);
    else console.warn(`[notify] emergency — patient=${patientId} hospital=${hospitalId}`);

    if (hospitalId) {
      await Promise.allSettled([
        sendPush({ hospitalId, patientName, reason }),
        sendEmail({ hospitalId, patientName, reason }),
      ]);
    }
  } catch (err) {
    console.error('[notify] unexpected error:', err?.message);
  }
}

module.exports = { notifyEmergency };
