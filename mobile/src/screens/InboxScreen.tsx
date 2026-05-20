import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import type { ConsultThread } from '../types';
import { threadsList } from '../lib/threads';
import { apiGet } from '../lib/api';
import { colors, glassSurface, styles, spacing } from '../ui/styles';
import { GlassCard } from '../ui/GlassCard';

type AppointmentRow = {
  id: string;
  hospital_id: string | null;
  starts_at: string;
  created_at: string;
  status: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatApptDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function bestAppointment(thread: ConsultThread, appts: AppointmentRow[]): AppointmentRow | null {
  if (!thread.hospital_id) return null;
  const matching = appts.filter(a => a.hospital_id === thread.hospital_id);
  if (!matching.length) return null;
  // Match the appointment whose created_at is closest to (and ideally just before) the thread's created_at.
  // Appointments are created seconds before the thread when booked through OgwuAI.
  const threadMs = new Date(thread.created_at).getTime();
  const withDelta = matching.map(a => ({ a, delta: threadMs - new Date(a.created_at).getTime() }));
  const before = withDelta.filter(x => x.delta >= 0).sort((x, y) => x.delta - y.delta);
  if (before.length) return before[0].a;
  return withDelta.sort((x, y) => Math.abs(x.delta) - Math.abs(y.delta))[0].a;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function urgencyColor(urgency: string | null): string {
  switch (urgency) {
    case 'emergency': return '#EF4444';
    case 'urgent':    return '#F97316';
    case 'soon':      return '#F59E0B';
    default:          return '#16A34A';
  }
}

function urgencyLabel(urgency: string | null): string {
  switch (urgency) {
    case 'emergency': return 'Emergency';
    case 'urgent':    return 'Urgent';
    case 'soon':      return 'See soon';
    default:          return 'Routine';
  }
}

function providerLabel(th: ConsultThread): string {
  if (th.hospital_name) return th.hospital_name;
  if (th.doctor?.name) return th.doctor.name;
  if (th.external_provider?.name) return th.external_provider.name;
  return 'Provider';
}

function threadTitle(th: ConsultThread): string {
  if (th.title) return th.title;
  const urgency = th.urgency ?? th.intake_snapshot?.urgency ?? null;
  if (urgency && urgency !== 'routine') return `${urgencyLabel(urgency)} consultation`;
  return 'Async consultation';
}

function previewText(th: ConsultThread): string | null {
  const msg = th.last_message;
  if (!msg) return th.intake_snapshot?.summary ?? null;
  const prefix = msg.sender_role === 'provider' ? 'Provider: ' : msg.sender_role === 'system' ? '' : 'You: ';
  return `${prefix}${msg.body}`.slice(0, 100);
}

// ── Thread row ────────────────────────────────────────────────────────────────

function ThreadRow({
  thread, onPress, muted, appointment,
}: {
  thread: ConsultThread;
  onPress: () => void;
  muted?: boolean;
  appointment?: AppointmentRow | null;
}) {
  const urg = thread.urgency ?? thread.intake_snapshot?.urgency ?? 'routine';
  const color = urgencyColor(urg);
  const activityTime = thread.last_message?.created_at ?? thread.updated_at;
  const preview = previewText(thread);
  const hasProviderReply = thread.last_message?.sender_role === 'provider';

  return (
    <View style={{ marginBottom: 10, opacity: muted ? 0.7 : 1 }}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        <GlassCard
          borderRadius={14}
          borderColor={hasProviderReply && !muted ? `${color}55` : 'rgba(255,255,255,0.18)'}
          innerStyle={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 }}
        >
        <View style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: muted ? colors.grey300 : color,
          marginTop: 5,
          flexShrink: 0,
        }} />

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.grey900, flex: 1, marginRight: 8 }} numberOfLines={1}>
              {threadTitle(thread)}
            </Text>
            <Text style={{ fontSize: 11, color: colors.grey500, flexShrink: 0 }}>
              {timeAgo(activityTime)}
            </Text>
          </View>

          <Text style={{ fontSize: 12, color: colors.grey500, marginTop: 2 }}>
            {providerLabel(thread)}
          </Text>

          {appointment && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <MaterialIcons name="event" size={11} color={colors.purpleGlow} />
              <Text style={{ fontSize: 12, color: colors.purpleGlow, fontWeight: '500' }}>
                {formatApptDate(appointment.starts_at)}
              </Text>
            </View>
          )}

          {preview ? (
            <Text style={{ fontSize: 13, color: (!muted && hasProviderReply) ? colors.grey900 : colors.grey500, lineHeight: 18, marginTop: 4 }} numberOfLines={2}>
              {preview}
            </Text>
          ) : null}

          {!muted && hasProviderReply && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
              <Text style={{ fontSize: 11, fontWeight: '600', color }}>Provider replied</Text>
            </View>
          )}

          {muted && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <MaterialIcons name="check-circle" size={12} color={colors.grey300} />
              <Text style={{ fontSize: 11, color: colors.grey300 }}>Closed</Text>
            </View>
          )}
        </View>

          <MaterialIcons name="chevron-right" size={18} color={colors.grey300} style={{ marginTop: 2 }} />
        </GlassCard>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export type InboxScreenProps = {
  busy: boolean;
  onOpenThread: (threadId: string) => void;
  onOpenAssistant: () => void;
  onThreadCountChange?: (count: number) => void;
};

export function InboxScreen({ busy, onOpenThread, onOpenAssistant, onThreadCountChange }: InboxScreenProps) {
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState<ConsultThread[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'inactive'>('active');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [threadsRes, apptsRes] = await Promise.allSettled([
          threadsList(),
          apiGet<{ appointments: AppointmentRow[] }>('/api/appointments'),
        ]);
        if (!mounted) return;
        if (threadsRes.status === 'fulfilled') {
          const list = Array.isArray(threadsRes.value.threads) ? threadsRes.value.threads : [];
          setThreads(list);
        } else {
          setError(threadsRes.reason?.message ?? 'Failed to load inbox.');
        }
        if (apptsRes.status === 'fulfilled') {
          setAppointments(apptsRes.value.appointments ?? []);
        }
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? 'Failed to load inbox.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const openThreads = useMemo(
    () => threads
      .filter(t => {
        if (t.status !== 'open') return false;
        const appt = bestAppointment(t, appointments);
        return !(appt && appt.status === 'cancelled');
      })
      .sort((a, b) => {
        const aTime = a.last_message?.created_at ?? a.updated_at;
        const bTime = b.last_message?.created_at ?? b.updated_at;
        return bTime.localeCompare(aTime);
      }),
    [threads, appointments],
  );

  const closedThreads = useMemo(
    () => threads
      .filter(t => {
        if (t.status === 'closed') return true;
        const appt = bestAppointment(t, appointments);
        return !!(appt && appt.status === 'cancelled');
      })
      .sort((a, b) => {
        const aTime = a.last_message?.created_at ?? a.updated_at;
        const bTime = b.last_message?.created_at ?? b.updated_at;
        return bTime.localeCompare(aTime);
      }),
    [threads, appointments],
  );

  useEffect(() => {
    onThreadCountChange?.(openThreads.length);
  }, [openThreads]);

  const displayThreads = activeTab === 'active' ? openThreads : closedThreads;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Inbox</Text>
        <Text style={[styles.helper, { marginBottom: 20 }]}>
          Your async consultations with providers.
        </Text>

        {/* Active / Inactive tabs */}
        {!loading && !error && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            {(['active', 'inactive'] as const).map(tab => {
              const isSelected = activeTab === tab;
              const count = tab === 'active' ? openThreads.length : closedThreads.length;
              const accentColor = tab === 'active' ? '#16A34A' : colors.grey300;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  activeOpacity={0.8}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 9,
                    paddingHorizontal: 10,
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: isSelected ? accentColor : glassSurface.borderSoft,
                    backgroundColor: isSelected
                      ? (tab === 'active' ? 'rgba(22,163,74,0.15)' : glassSurface.bgMid)
                      : glassSurface.bg,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: isSelected ? accentColor : colors.grey500, textTransform: 'capitalize' }}>
                    {tab}
                  </Text>
                  {count > 0 && (
                    <View style={{
                      backgroundColor: accentColor,
                      borderRadius: 8,
                      minWidth: 18,
                      height: 18,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 4,
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.white }}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {loading && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator color={colors.purple} />
          </View>
        )}

        {!loading && error && (
          <Text style={[styles.helper, { color: colors.error }]}>{error}</Text>
        )}

        {!loading && !error && displayThreads.length === 0 && (
          <View style={{
            alignItems: 'center',
            paddingVertical: 48,
            paddingHorizontal: spacing.lg,
          }}>
            <View style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: glassSurface.bgMid,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}>
              <MaterialIcons name="inbox" size={30} color={colors.purple} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.grey900, marginBottom: 8, textAlign: 'center' }}>
              {activeTab === 'active' ? 'No active conversations' : 'No closed conversations'}
            </Text>
            <Text style={{ fontSize: 13, color: colors.grey500, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
              {activeTab === 'active'
                ? 'When you book an appointment or get referred to a provider, your conversation thread will appear here.'
                : 'Closed consultations will appear here for your records.'
              }
            </Text>
            {activeTab === 'active' && (
              <TouchableOpacity
                onPress={onOpenAssistant}
                activeOpacity={0.85}
                style={[styles.btnPrimary, busy && styles.btnPrimaryDisabled, { paddingHorizontal: spacing.lg }]}
                disabled={busy}
              >
                <Text style={styles.btnPrimaryText}>Start a consultation</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!loading && !error && displayThreads.length > 0 && (
          <View>
            {displayThreads.map(th => (
              <ThreadRow
                key={th.id}
                thread={th}
                onPress={() => onOpenThread(th.id)}
                muted={activeTab === 'inactive'}
                appointment={bestAppointment(th, appointments)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
