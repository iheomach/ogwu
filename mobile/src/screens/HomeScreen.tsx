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
import { colors, spacing } from '../ui/styles';
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
        style={{
          backgroundColor: '#fff',
          borderRadius: 16,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: 'rgba(69,0,80,0.08)',
          shadowColor: colors.purple,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 3,
          minHeight: 110,
          justifyContent: 'space-between',
        }}
      >
        <View style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: accent ? `${accent}18` : 'rgba(69,0,80,0.07)',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
        }}>
          <MaterialIcons name={icon} size={20} color={accent ?? colors.purple} />
        </View>
        <View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.grey900 }}>{label}</Text>
          <Text style={{ fontSize: 11, color: colors.grey500, marginTop: 2 }}>{subtitle}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function UrgencyBanner({ intake }: { intake: TriageIntake }) {
  const cfg = urgencyConfig(intake.urgency ?? 'routine');
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: cfg.bg,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 10,
      borderWidth: 1,
      borderColor: `${cfg.fg}30`,
    }}>
      <MaterialIcons name={cfg.icon} size={18} color={cfg.fg} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: cfg.fg }}>{cfg.label}</Text>
        <Text style={{ fontSize: 11, color: cfg.fg, opacity: 0.8, marginTop: 1 }}>
          {intake.summary ?? `${intake.answers.length} intake answers on file`}
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF7FB' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── Hero header ── */}
          <View style={{
            backgroundColor: colors.purple,
            paddingTop: 24,
            paddingBottom: 32,
            paddingHorizontal: spacing.lg,
            borderBottomLeftRadius: 28,
            borderBottomRightRadius: 28,
          }}>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '500' }}>
              {getGreeting()}
            </Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: '#fff', marginTop: 2, letterSpacing: -0.5 }}>
              {displayName ? displayName : 'Welcome'}
            </Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 6, lineHeight: 19 }}>
              Your health, managed with care.
            </Text>

          </View>

          <View style={{ paddingHorizontal: spacing.lg }}>

            {/* ── Quick actions ── */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.grey500, marginTop: 24, marginBottom: 12, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              Quick actions
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
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
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.grey500, marginTop: 28, marginBottom: 12, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              Health status
            </Text>

            {intakeLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <ActivityIndicator color={colors.purple} />
              </View>
            ) : intake ? (
              <View style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                padding: spacing.md,
                borderWidth: 1,
                borderColor: 'rgba(69,0,80,0.07)',
                shadowColor: colors.purple,
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.07,
                shadowRadius: 10,
                elevation: 2,
                gap: 14,
              }}>
                <UrgencyBanner intake={intake} />

                {tags.length > 0 && (
                  <View>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.grey500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Flagged symptoms
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {tags.map((tag) => (
                        <View key={tag.label} style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                          backgroundColor: 'rgba(69,0,80,0.05)',
                          borderRadius: 20,
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                        }}>
                          <MaterialIcons name={tag.icon as any} size={12} color={colors.purple} />
                          <Text style={{ fontSize: 12, color: colors.purple, fontWeight: '600' }}>{tag.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <View style={{ height: 1, backgroundColor: 'rgba(69,0,80,0.06)' }} />

                <Text style={{ fontSize: 12, color: colors.grey500, lineHeight: 18 }}>
                  {t('home.impactDisclaimer')}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={onGoProfile}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 18,
                  padding: spacing.md,
                  borderWidth: 1.5,
                  borderColor: 'rgba(69,0,80,0.1)',
                  borderStyle: 'dashed',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 24,
                }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(69,0,80,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="assignment" size={22} color={colors.purple} />
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.grey900 }}>No intake on file</Text>
                <Text style={{ fontSize: 12, color: colors.grey500, textAlign: 'center' }}>
                  Complete a quick intake from your profile to get personalised health insights.
                </Text>
                <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 12, color: colors.purple, fontWeight: '700' }}>Go to Profile</Text>
                  <MaterialIcons name="arrow-forward" size={14} color={colors.purple} />
                </View>
              </TouchableOpacity>
            )}

            {/* ── Why early care matters ── */}
            {intake && (
              <>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.grey500, marginTop: 28, marginBottom: 12, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                  {t('home.impactTitle')}
                </Text>
                <View style={{
                  backgroundColor: '#fff',
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: 'rgba(69,0,80,0.07)',
                  overflow: 'hidden',
                  shadowColor: colors.purple,
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.07,
                  shadowRadius: 10,
                  elevation: 2,
                }}>
                  {[
                    { icon: 'bolt' as const, text: (intake.urgency === 'emergency' || intake.urgency === 'urgent') ? t('home.impactUrgent1') : t('home.impactRoutine1') },
                    { icon: 'favorite' as const, text: (intake.urgency === 'emergency' || intake.urgency === 'urgent') ? t('home.impactUrgent2') : t('home.impactRoutine2') },
                  ].map((item, i) => (
                    <View key={i} style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: spacing.md,
                      borderBottomWidth: i === 0 ? 1 : 0,
                      borderBottomColor: 'rgba(69,0,80,0.05)',
                    }}>
                      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(69,0,80,0.07)', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                        <MaterialIcons name={item.icon} size={16} color={colors.purple} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, color: colors.grey700, lineHeight: 20 }}>{item.text}</Text>
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
