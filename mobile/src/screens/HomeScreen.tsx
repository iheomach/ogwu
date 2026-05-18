import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import type { HomeScreenProps } from '../types';
import type { TriageIntake } from '../types';
import { triageGetIntake } from '../lib/triage';
import { colors, styles, spacing } from '../ui/styles';
import { t } from '../i18n';

// ── Helpers ──────────────────────────────────────────────────────────────────

function urgencyConfig(urgency: TriageIntake['urgency']) {
  switch (urgency) {
    case 'emergency':
      return { bg: 'rgba(239,68,68,0.1)', fg: '#EF4444', icon: 'emergency' as const, label: 'Emergency' };
    case 'urgent':
      return { bg: 'rgba(249,115,22,0.1)', fg: '#F97316', icon: 'warning' as const, label: 'Urgent' };
    case 'soon':
      return { bg: 'rgba(245,158,11,0.1)', fg: '#F59E0B', icon: 'schedule' as const, label: 'See soon' };
    default:
      return { bg: 'rgba(22,163,74,0.1)', fg: '#16A34A', icon: 'check-circle' as const, label: 'Routine' };
  }
}

function normalizeText(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function deriveSituationTags(intake: TriageIntake | null): Array<{ label: string; icon: string }> {
  if (!intake) return [];
  const text = normalizeText(intake.answers.map((x) => `${x?.q || ''} ${x?.a || ''}`).join(' '));
  const tags: Array<{ label: string; icon: string }> = [];
  if (/(breath|breathing|cough|wheeze|shortness)/.test(text)) tags.push({ label: t('home.tagBreathing'), icon: 'air' });
  if (/(fever|temperature|chills)/.test(text)) tags.push({ label: t('home.tagFever'), icon: 'thermostat' });
  if (/(vomit|nausea|diarrhea|stomach|abdominal|belly)/.test(text)) tags.push({ label: t('home.tagStomach'), icon: 'sick' });
  if (/(urine|urinary|pee|burning|uti)/.test(text)) tags.push({ label: t('home.tagUrinary'), icon: 'water-drop' });
  if (/(rash|swelling|itch|skin)/.test(text)) tags.push({ label: t('home.tagSkin'), icon: 'healing' });
  if (/(pain|ache|hurt|cramp|migraine|headache)/.test(text)) tags.push({ label: t('home.tagPain'), icon: 'personal-injury' });
  return Array.from(new Map(tags.map((t) => [t.label, t])).values());
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function QuickActionCard({
  icon,
  label,
  subtitle,
  onPress,
  accent,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  subtitle: string;
  onPress: () => void;
  accent?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40 }).start();
  const handlePressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }], flex: 1 }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={styles.quickActionCard}
      >
        <View style={[styles.quickActionIconBox, { backgroundColor: accent ? `${accent}18` : 'rgba(69,0,80,0.07)' }]}>
          <MaterialIcons name={icon} size={20} color={accent ?? colors.purple} />
        </View>
        <View>
          <Text style={styles.quickActionLabel}>{label}</Text>
          <Text style={styles.quickActionSubtitle}>{subtitle}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function firstSentence(text: string | null | undefined): string {
  if (!text) return '';
  const m = text.match(/^[^.!?]*[.!?]/);
  return m ? m[0].trim() : text.slice(0, 120).trim();
}

function UrgencyBanner({ intake }: { intake: TriageIntake }) {
  const cfg = urgencyConfig(intake.urgency ?? 'routine');
  const sentence = firstSentence(intake.summary) || `${intake.answers.length} intake answers on file`;
  return (
    <View style={[styles.urgencyBannerRow, { backgroundColor: cfg.bg, borderColor: `${cfg.fg}30` }]}>
      <MaterialIcons name={cfg.icon} size={18} color={cfg.fg} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.urgencyBannerLabel, { color: cfg.fg }]}>{cfg.label}</Text>
        <Text style={[styles.urgencyBannerSummary, { color: cfg.fg }]} numberOfLines={1}>
          {sentence}
        </Text>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function HomeScreen({
  busy,
  profile,
  onGoNewConsult,
  onGoRecords,
  onGoProfile,
}: HomeScreenProps) {
  const displayName = profile?.first_name?.trim() || '';
  const [intakeLoading, setIntakeLoading] = useState(true);
  const [intake, setIntake] = useState<TriageIntake | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, speed: 14, bounciness: 4, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await triageGetIntake();
        if (mounted) setIntake(res.intake);
      } catch {
        if (mounted) setIntake(null);
      } finally {
        if (mounted) setIntakeLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const tags = useMemo(() => deriveSituationTags(intake), [intake]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.purple }]}>
      <ScrollView
        style={[styles.spacer, { backgroundColor: colors.bg }]}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── Hero header ── */}
          <View style={styles.heroHeader}>
            <Text style={styles.heroGreeting}>{getGreeting()}</Text>
            <Text style={styles.heroName}>{displayName ? displayName : 'Welcome'}</Text>
            <Text style={styles.heroTagline}>Your health, managed with care.</Text>
          </View>

          <View style={{ paddingHorizontal: spacing.lg }}>

            {/* ── Quick actions ── */}
            <Text style={[styles.sectionLabel, { marginTop: 24, marginBottom: 12 }]}>
              Quick actions
            </Text>
            <View style={styles.quickActionsRow}>
              <QuickActionCard
                icon="add-circle-outline"
                label="New consultation"
                subtitle="Talk to the AI assistant"
                onPress={onGoNewConsult}
                accent={colors.purple}
              />
              <QuickActionCard
                icon="description"
                label="My records"
                subtitle="Past visits & history"
                onPress={onGoRecords}
                accent="#2563EB"
              />
            </View>

            {/* ── Health status ── */}
            <Text style={[styles.sectionLabel, { marginTop: 28, marginBottom: 12 }]}>
              Health status
            </Text>

            {intakeLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <ActivityIndicator color={colors.purple} />
              </View>
            ) : intake ? (
              <View style={styles.healthStatusCard}>
                <UrgencyBanner intake={intake} />

                {tags.length > 0 && (
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
                )}

                <View style={styles.thinDivider} />

                <Text style={{ fontSize: 12, color: colors.grey500, lineHeight: 18 }}>
                  {t('home.impactDisclaimer')}
                </Text>
              </View>
            ) : (
              <TouchableOpacity onPress={onGoProfile} style={styles.noIntakeCard}>
                <View style={styles.noIntakeIconBox}>
                  <MaterialIcons name="assignment" size={22} color={colors.purple} />
                </View>
                <Text style={styles.noIntakeTitle}>No intake on file</Text>
                <Text style={styles.noIntakeBody}>
                  Complete a quick intake from your profile to get personalised health insights.
                </Text>
                <View style={styles.noIntakeAction}>
                  <Text style={styles.noIntakeLinkText}>Go to Profile</Text>
                  <MaterialIcons name="arrow-forward" size={14} color={colors.purple} />
                </View>
              </TouchableOpacity>
            )}

            {/* ── Why early care matters ── */}
            {intake && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 28, marginBottom: 12 }]}>
                  {t('home.impactTitle')}
                </Text>
                <View style={styles.impactCard}>
                  {[
                    { icon: 'bolt' as const, text: (intake.urgency === 'emergency' || intake.urgency === 'urgent') ? t('home.impactUrgent1') : t('home.impactRoutine1') },
                    { icon: 'favorite' as const, text: (intake.urgency === 'emergency' || intake.urgency === 'urgent') ? t('home.impactUrgent2') : t('home.impactRoutine2') },
                  ].map((item, i) => (
                    <View key={i} style={[styles.impactItem, i === 0 && styles.impactItemDivider]}>
                      <View style={styles.impactItemIcon}>
                        <MaterialIcons name={item.icon} size={16} color={colors.purple} />
                      </View>
                      <Text style={styles.impactItemText}>{item.text}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
