import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import type { ConsultThread } from '../types';
import { threadsList } from '../lib/threads';
import { colors, styles, spacing } from '../ui/styles';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function ThreadRow({ thread, onPress }: { thread: ConsultThread; onPress: () => void }) {
  const urg = thread.urgency ?? thread.intake_snapshot?.urgency ?? 'routine';
  const color = urgencyColor(urg);
  const activityTime = thread.last_message?.created_at ?? thread.updated_at;
  const preview = previewText(thread);
  const hasProviderReply = thread.last_message?.sender_role === 'provider';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        backgroundColor: colors.white,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: hasProviderReply ? `${color}30` : 'rgba(69,0,80,0.07)',
        shadowColor: colors.purple,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {/* Urgency dot */}
      <View style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: color,
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

        <Text style={{ fontSize: 12, color: colors.grey500, marginTop: 2, marginBottom: 4 }}>
          {providerLabel(thread)}
        </Text>

        {preview ? (
          <Text style={{ fontSize: 13, color: hasProviderReply ? colors.grey900 : colors.grey500, lineHeight: 18 }} numberOfLines={2}>
            {preview}
          </Text>
        ) : null}

        {hasProviderReply && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
            <Text style={{ fontSize: 11, fontWeight: '600', color }}>Provider replied</Text>
          </View>
        )}
      </View>

      <MaterialIcons name="chevron-right" size={18} color={colors.grey300} style={{ marginTop: 2 }} />
    </TouchableOpacity>
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await threadsList();
        const list = Array.isArray(res.threads) ? res.threads : [];
        if (!mounted) return;
        setThreads(list);
        const openCount = list.filter(t => t.status === 'open').length;
        onThreadCountChange?.(openCount);
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
    () => threads.filter(t => t.status === 'open').sort((a, b) => {
      // Provider replies bubble to top
      const aTime = a.last_message?.created_at ?? a.updated_at;
      const bTime = b.last_message?.created_at ?? b.updated_at;
      return bTime.localeCompare(aTime);
    }),
    [threads],
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Inbox</Text>
        <Text style={[styles.helper, { marginBottom: 24 }]}>
          Active conversations with your care team.
        </Text>

        {loading && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator color={colors.purple} />
          </View>
        )}

        {!loading && error && (
          <Text style={[styles.helper, { color: colors.error }]}>{error}</Text>
        )}

        {!loading && !error && openThreads.length === 0 && (
          <View style={{
            alignItems: 'center',
            paddingVertical: 48,
            paddingHorizontal: spacing.lg,
          }}>
            <View style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: 'rgba(69,0,80,0.07)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}>
              <MaterialIcons name="inbox" size={30} color={colors.purple} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.grey900, marginBottom: 8, textAlign: 'center' }}>
              No active conversations
            </Text>
            <Text style={{ fontSize: 13, color: colors.grey500, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
              When you book an appointment or get referred to a provider, your conversation thread will appear here.
            </Text>
            <TouchableOpacity
              onPress={onOpenAssistant}
              activeOpacity={0.85}
              style={[styles.btnPrimary, busy && styles.btnPrimaryDisabled]}
              disabled={busy}
            >
              <Text style={styles.btnPrimaryText}>Start a consultation</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && openThreads.length > 0 && (
          <View>
            {openThreads.map(th => (
              <ThreadRow
                key={th.id}
                thread={th}
                onPress={() => onOpenThread(th.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
