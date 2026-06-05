import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';

import type { HomeScreenProps } from '../types';
import type { ConsultThread, TriageIntake } from '../types';
import type { AppointmentRow } from '../lib/appointments';
import { fetchAppointments, nextFutureAppointment } from '../lib/appointments';
import { threadsList } from '../lib/threads';
import { triageGetIntake, triageHomeSummary } from '../lib/triage';
import { colors, glassSurface, styles, spacing } from '../ui/styles';
import { ThinkingIndicator } from '../ui/ThinkingIndicator';
import { GlassCard } from '../ui/GlassCard';
import { t } from '../i18n';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
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

function formatApptDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

function urgencyConfig(urgency: TriageIntake['urgency']) {
  switch (urgency) {
    case 'emergency':
      return { bg: 'rgba(239,68,68,0.18)', fg: '#EF4444', icon: 'emergency' as const, label: 'Seek care now' };
    case 'urgent':
      return { bg: 'rgba(249,115,22,0.18)', fg: '#F97316', icon: 'warning' as const, label: 'See a doctor today' };
    case 'soon':
      return { bg: 'rgba(245,158,11,0.18)', fg: '#F59E0B', icon: 'schedule' as const, label: 'See a doctor this week' };
    default:
      return { bg: 'rgba(22,163,74,0.18)', fg: '#16A34A', icon: 'check-circle' as const, label: 'Monitor your symptoms' };
  }
}

function urgencyColor(urgency: string | null): string {
  switch (urgency) {
    case 'emergency': return '#EF4444';
    case 'urgent':    return '#F97316';
    case 'soon':      return '#F59E0B';
    default:          return '#16A34A';
  }
}

function threadTitle(th: ConsultThread): string {
  if (th.title) return th.title;
  const urg = th.urgency ?? th.intake_snapshot?.urgency ?? null;
  if (urg && urg !== 'routine') {
    const labels: Record<string, string> = { emergency: 'Emergency', urgent: 'Urgent', soon: 'See soon' };
    return `${labels[urg] ?? ''} consultation`;
  }
  return 'Async consultation';
}

function providerLabel(th: ConsultThread): string {
  if (th.hospital_name) return th.hospital_name;
  if (th.doctor?.name) return th.doctor.name;
  if (th.external_provider?.name) return th.external_provider.name;
  return 'Provider';
}

function previewText(th: ConsultThread): string | null {
  const msg = th.last_message;
  if (!msg) return th.intake_snapshot?.summary ?? null;
  const prefix =
    msg.sender_role === 'provider' ? 'Provider: ' :
    msg.sender_role === 'system'   ? '' : 'You: ';
  return `${prefix}${msg.body}`.slice(0, 100);
}

function normalizeText(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function deriveSituationTags(intake: TriageIntake | null): Array<{ label: string; icon: string }> {
  if (!intake) return [];
  const text = normalizeText(intake.answers.map((x) => `${x?.q || ''} ${x?.a || ''}`).join(' '));
  const tags: Array<{ label: string; icon: string }> = [];
  if (/(breath|breathing|cough|wheeze|shortness)/.test(text)) tags.push({ label: t('home.tagBreathing'), icon: 'air' });
  if (/(fever|temperature|chills)/.test(text))                tags.push({ label: t('home.tagFever'), icon: 'thermostat' });
  if (/(vomit|nausea|diarrhea|stomach|abdominal|belly)/.test(text)) tags.push({ label: t('home.tagStomach'), icon: 'sick' });
  if (/(urine|urinary|pee|burning|uti)/.test(text))           tags.push({ label: t('home.tagUrinary'), icon: 'water-drop' });
  if (/(rash|swelling|itch|skin)/.test(text))                 tags.push({ label: t('home.tagSkin'), icon: 'healing' });
  if (/(pain|ache|hurt|cramp|migraine|headache)/.test(text))  tags.push({ label: t('home.tagPain'), icon: 'personal-injury' });
  return Array.from(new Map(tags.map((t) => [t.label, t])).values());
}

function isStale(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() > 7 * 24 * 60 * 60 * 1000;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function QuickActionCard({
  icon,
  label,
  subtitle,
  onPress,
  accent,
  onLayout,
  cardHeight,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  subtitle: string;
  onPress: () => void;
  accent?: string;
  onLayout?: (e: any) => void;
  cardHeight?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn  = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40 }).start();
  const handlePressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }], flex: 1 }}>
      <TouchableOpacity onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} activeOpacity={1}>
        <GlassCard
          borderRadius={10}
          innerStyle={{ padding: spacing.md, minHeight: cardHeight || 110, justifyContent: 'space-between' }}
          onLayout={onLayout}
        >
          <View style={[styles.quickActionIconBox, { backgroundColor: accent ? `${accent}22` : glassSurface.bgMid }]}>
            <MaterialIcons name={icon} size={20} color={accent ?? colors.purple} />
          </View>
          <View>
            <Text style={styles.quickActionLabel}>{label}</Text>
            <Text style={styles.quickActionSubtitle} numberOfLines={2}>{subtitle}</Text>
          </View>
        </GlassCard>
      </TouchableOpacity>
    </Animated.View>
  );
}

function ThreadPreviewRow({ thread, onPress }: { thread: ConsultThread; onPress: () => void }) {
  const hasProviderReply = thread.last_message?.sender_role === 'provider';
  const urg = thread.urgency ?? thread.intake_snapshot?.urgency ?? 'routine';
  const color = urgencyColor(urg);
  const preview = previewText(thread);
  const activityTime = thread.last_message?.created_at ?? thread.updated_at;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ marginBottom: 8 }}>
      <GlassCard borderRadius={12} innerStyle={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{
            width: 8, height: 8, borderRadius: 4,
            backgroundColor: hasProviderReply ? color : colors.grey300,
            marginTop: 5, flexShrink: 0,
          }} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.grey900, flex: 1, marginRight: 8 }} numberOfLines={1}>
                {threadTitle(thread)}
              </Text>
              <Text style={{ fontSize: 11, color: colors.grey500, flexShrink: 0 }}>{timeAgo(activityTime)}</Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.grey500, marginTop: 1 }}>{providerLabel(thread)}</Text>
            {preview ? (
              <Text
                style={{ fontSize: 13, color: hasProviderReply ? colors.grey900 : colors.grey500, lineHeight: 18, marginTop: 3 }}
                numberOfLines={1}
              >
                {preview}
              </Text>
            ) : null}
            {hasProviderReply && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
                <Text style={{ fontSize: 11, fontWeight: '600', color }}>Provider replied</Text>
              </View>
            )}
          </View>
          <MaterialIcons name="chevron-right" size={16} color={colors.grey300} style={{ marginTop: 2 }} />
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

function AppointmentCard({
  appt,
  hospitalName,
  onPress,
}: {
  appt: AppointmentRow;
  hospitalName: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ marginBottom: 4 }}>
      <GlassCard borderRadius={12} innerStyle={{ padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{
          width: 40, height: 40, borderRadius: 10,
          backgroundColor: 'rgba(123,77,217,0.18)',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <MaterialIcons name="event" size={20} color={colors.purple} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.grey900 }} numberOfLines={1}>{hospitalName}</Text>
          <Text style={{ fontSize: 12, color: colors.purpleGlow, marginTop: 2, fontWeight: '500' }}>
            {formatApptDate(appt.starts_at)}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={18} color={colors.grey300} />
      </GlassCard>
    </TouchableOpacity>
  );
}

function UrgencyBanner({ intake, homeSummary }: { intake: TriageIntake; homeSummary: string | null }) {
  const cfg = urgencyConfig(intake.urgency ?? 'routine');
  const text = homeSummary ?? `${intake.answers.length} intake answer${intake.answers.length === 1 ? '' : 's'} recorded`;
  return (
    <View style={[styles.urgencyBannerRow, { backgroundColor: cfg.bg, borderColor: `${cfg.fg}30` }]}>
      <MaterialIcons name={cfg.icon} size={18} color={cfg.fg} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.urgencyBannerLabel, { color: cfg.fg }]}>{cfg.label}</Text>
        <Text style={[styles.urgencyBannerSummary, { color: cfg.fg }]} numberOfLines={2}>{text}</Text>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function HomeScreen({
  busy,
  profile,
  onGoNewConsult,
  onGoNewConsultWithMessage,
  onGoRecords,
  onRunTriage,
  onSendSummaryToHospital,
  onOpenThread,
}: HomeScreenProps) {
  const displayName = profile?.first_name?.trim() || '';

  const [loading, setLoading]         = useState(true);
  const [threads, setThreads]         = useState<ConsultThread[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [intake, setIntake]           = useState<TriageIntake | null>(null);
  const [homeSummary, setHomeSummary] = useState<string | null>(null);
  const [cardH, setCardH]             = useState(0);
  const onCardLayout = useCallback((e: any) => {
    const h = e.nativeEvent.layout.height;
    setCardH(prev => Math.max(prev, h));
  }, []);

  const [sendingSummary, setSendingSummary] = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, speed: 14, bounciness: 4, useNativeDriver: true }),
    ]).start();
  }, []);

  // Parallel data fetch — all four in one round-trip
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [threadsRes, apptsRes, intakeRes, summaryRes] = await Promise.allSettled([
        threadsList(),
        fetchAppointments(),
        triageGetIntake(),
        triageHomeSummary(),
      ]);
      if (!mounted) return;
      if (threadsRes.status === 'fulfilled') {
        setThreads(Array.isArray(threadsRes.value.threads) ? threadsRes.value.threads : []);
      }
      if (apptsRes.status === 'fulfilled') {
        setAppointments(apptsRes.value);
      }
      if (intakeRes.status === 'fulfilled') {
        setIntake(intakeRes.value.intake);
      }
      if (summaryRes.status === 'fulfilled') {
        setHomeSummary(summaryRes.value.summary);
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  // Derived
  const openThreads = useMemo(
    () => threads
      .filter(t => t.status === 'open')
      .sort((a, b) => {
        const aT = a.last_message?.created_at ?? a.updated_at;
        const bT = b.last_message?.created_at ?? b.updated_at;
        return bT.localeCompare(aT);
      }),
    [threads]
  );

  const recentThreads = openThreads.slice(0, 2);

  const nextAppt = useMemo(() => nextFutureAppointment(appointments), [appointments]);

  const nextApptThread = useMemo(() => {
    if (!nextAppt?.hospital_id) return null;
    return threads.find(t => t.hospital_id === nextAppt.hospital_id) ?? null;
  }, [nextAppt, threads]);

  const hasIntake  = !!intake;
  const intakeStale = hasIntake && intake?.updated_at ? isStale(intake.updated_at) : false;
  const tags = useMemo(() => deriveSituationTags(intake), [intake]);

  const lastHospital = useMemo(() => {
    const t = threads
      .filter(th => th.hospital_id && th.hospital_name)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    return t ? { id: t.hospital_id!, name: t.hospital_name! } : null;
  }, [threads]);

  const handleSendSummary = useCallback(() => {
    if (!lastHospital || sendingSummary) return;
    Alert.alert(
      'Send health summary',
      `Send your current health summary to ${lastHospital.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSendingSummary(true);
            try {
              await onSendSummaryToHospital(lastHospital.id, lastHospital.name);
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Could not send summary');
            } finally {
              setSendingSummary(false);
            }
          },
        },
      ],
    );
  }, [lastHospital, sendingSummary, onSendSummaryToHospital]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.spacer}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── Hero ── */}
          <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.md, paddingTop: 22, paddingBottom: 24 }}>
            <Text style={styles.heroGreeting}>{getGreeting()}</Text>
            <Text style={styles.heroName}>{displayName ? displayName : 'Welcome'}</Text>
            <Text style={styles.heroTagline}>Your health, managed with care.</Text>
          </View>

          <View style={{ paddingHorizontal: spacing.lg }}>

            {/* ── Open threads widget ── */}
            {loading ? (
              <View style={{ alignSelf: 'flex-start', marginBottom: 20 }}>
                <ThinkingIndicator />
              </View>
            ) : recentThreads.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { marginBottom: 10 }]}>Messages</Text>
                {recentThreads.map(th => (
                  <ThreadPreviewRow key={th.id} thread={th} onPress={() => onOpenThread(th.id)} />
                ))}
              </>
            ) : null}

            {/* ── Next appointment ── */}
            {!loading && nextAppt && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: recentThreads.length > 0 ? 24 : 0, marginBottom: 10 }]}>
                  Next appointment
                </Text>
                <AppointmentCard
                  appt={nextAppt}
                  hospitalName={nextApptThread ? providerLabel(nextApptThread) : 'Hospital'}
                  onPress={() => nextApptThread && onOpenThread(nextApptThread.id)}
                />
              </>
            )}

            {/* ── Quick actions ── */}
            <Text style={[styles.sectionLabel, { marginTop: 24, marginBottom: 12 }]}>Quick actions</Text>
            <QuickActionCard
              icon="location-on"
              label="Find hospitals"
              subtitle="See hospitals near you now"
              onPress={() => onGoNewConsultWithMessage('Find hospitals near me')}
              accent={colors.purple}
            />
            <View style={[styles.quickActionsRow, { marginTop: 10 }]}>
              {lastHospital ? (
                <QuickActionCard
                  icon="send"
                  label="Send summary"
                  subtitle={`Send to ${lastHospital.name}`}
                  onPress={handleSendSummary}
                  accent="#059669"
                  onLayout={onCardLayout}
                  cardHeight={cardH}
                />
              ) : (
                <QuickActionCard
                  icon="upload-file"
                  label="Upload record"
                  subtitle="Add documents to your file"
                  onPress={onGoRecords}
                  accent="#059669"
                  onLayout={onCardLayout}
                  cardHeight={cardH}
                />
              )}
              {lastHospital ? (
                <QuickActionCard
                  icon="event-available"
                  label="Book again"
                  subtitle={`At ${lastHospital.name}`}
                  onPress={() => onGoNewConsultWithMessage(`Book an appointment at ${lastHospital.name}`)}
                  accent="#D97706"
                  onLayout={onCardLayout}
                  cardHeight={cardH}
                />
              ) : (
                <QuickActionCard
                  icon={hasIntake ? 'refresh' : 'assignment'}
                  label={hasIntake ? 'Update check-in' : 'Start check-in'}
                  subtitle={hasIntake ? 'Refresh your health status' : 'Complete your first check-in'}
                  onPress={onRunTriage}
                  accent="#D97706"
                  onLayout={onCardLayout}
                  cardHeight={cardH}
                />
              )}
            </View>

            {/* ── Health status (only when intake exists) ── */}
            {!loading && hasIntake && intake && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 28, marginBottom: 12 }]}>Health status</Text>
                <GlassCard borderRadius={10} innerStyle={{ padding: spacing.md, gap: 14 }}>
                  <UrgencyBanner intake={intake} homeSummary={homeSummary} />

                  {intakeStale && (
                    <TouchableOpacity
                      onPress={onRunTriage}
                      activeOpacity={0.75}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                    >
                      <MaterialIcons name="refresh" size={13} color={colors.purpleGlow} />
                      <Text style={{ fontSize: 12, color: colors.purpleGlow, fontWeight: '600' }}>
                        Last updated {timeAgo(intake.updated_at)} · Update check-in
                      </Text>
                    </TouchableOpacity>
                  )}

                  <Text style={{ fontSize: 11, color: colors.grey500, lineHeight: 16 }}>
                    {t('home.impactDisclaimer')}
                  </Text>

                  {tags.length > 0 && (
                    <>
                      <View style={styles.thinDivider} />
                      <View>
                        <Text style={styles.symptomTagsLabel}>Flagged symptoms</Text>
                        <View style={styles.symptomTagsRow}>
                          {tags.map((tag) => (
                            <View key={tag.label} style={styles.symptomTag}>
                              <MaterialIcons name={tag.icon as any} size={12} color={colors.purple} />
                              <Text style={styles.symptomTagText}>{tag.label}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </>
                  )}
                </GlassCard>
              </>
            )}

          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
