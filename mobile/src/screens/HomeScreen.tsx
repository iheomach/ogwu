import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { HomeScreenProps } from '../types';
import type { TriageIntake } from '../types';
import { triageGetIntake } from '../lib/triage';
import { styles, colors } from '../ui/styles';
import { t } from '../i18n';

function urgencyColors(urgency: TriageIntake['urgency']) {
  switch (urgency) {
    case 'emergency':
      return { bg: colors.errorLight, fg: colors.error };
    case 'urgent':
      return { bg: colors.urgentLight, fg: colors.urgent };
    case 'soon':
      return { bg: colors.warningLight, fg: colors.warning };
    default:
      return { bg: colors.successLight, fg: colors.success };
  }
}

function normalizeText(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s+/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveSituationTags(intake: TriageIntake | null): string[] {
  if (!intake) return [];
  const text = normalizeText(
    intake.answers
      .map((x) => `${x?.q || ''} ${x?.a || ''}`)
      .join(' ')
  );
  if (!text) return [];

  const tags: string[] = [];
  if (/(breath|breathing|cough|wheeze|shortness)/.test(text)) tags.push(t('home.tagBreathing'));
  if (/(fever|temperature|chills)/.test(text)) tags.push(t('home.tagFever'));
  if (/(vomit|vomiting|nausea|diarrhea|stomach|abdominal|belly)/.test(text)) tags.push(t('home.tagStomach'));
  if (/(urine|urinary|pee|burning|uti)/.test(text)) tags.push(t('home.tagUrinary'));
  if (/(rash|swelling|itch|itching|skin)/.test(text)) tags.push(t('home.tagSkin'));
  if (/(pain|ache|hurt|cramp|migraine|headache)/.test(text)) tags.push(t('home.tagPain'));

  // De-dupe, preserve order.
  return Array.from(new Set(tags));
}

function impactLines(intake: TriageIntake | null): string[] {
  if (!intake) return [t('home.impactNoIntake')];

  const u = intake.urgency ?? 'routine';
  if (u === 'emergency') {
    return [t('home.impactEmergency1'), t('home.impactEmergency2')];
  }
  if (u === 'urgent') {
    return [t('home.impactUrgent1'), t('home.impactUrgent2')];
  }
  if (u === 'soon') {
    return [t('home.impactSoon1'), t('home.impactSoon2')];
  }
  return [t('home.impactRoutine1'), t('home.impactRoutine2')];
}

export function HomeScreen({
  busy,
  phoneLabel,
  profile,
}: HomeScreenProps) {
  const displayFirstName =
    profile?.first_name?.trim() ||
    '';

  const [intakeLoading, setIntakeLoading] = useState(true);
  const [intake, setIntake] = useState<TriageIntake | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setIntakeLoading(true);
        const res = await triageGetIntake();
        if (!mounted) return;
        setIntake(res.intake);
      } catch {
        if (!mounted) return;
        setIntake(null);
      } finally {
        if (mounted) setIntakeLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const situationTags = useMemo(() => deriveSituationTags(intake), [intake]);
  const lines = useMemo(() => impactLines(intake), [intake]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { justifyContent: 'flex-start', opacity: busy ? 0.7 : 1 }]}
      >
      {/* Header */}
      <View style={[styles.rowBetween, { marginBottom: 32 }]}>
        <View style={styles.brandRow}>
          <View style={styles.brandDot} />
          <Text style={styles.brandName}>{t('common.appName')}</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{t('home.rolePatient')}</Text>
        </View>
      </View>

      {/* Greeting */}
      <Text style={styles.title}>
        {displayFirstName ? t('home.hi', { name: displayFirstName }) : t('home.hello')}
      </Text>
      <Text style={[styles.helper, { marginBottom: 8 }]}>{phoneLabel}</Text>
      <View style={[styles.divider, { marginVertical: 8 }]} />
      <View style={styles.mt8} />
      <Text style={[styles.label, { marginBottom: 12 }]}>{t('home.yourAnalytics')}</Text>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.value}>{t('home.intakeSnapshot')}</Text>
          {intakeLoading ? (
            <ActivityIndicator color={colors.purple} />
          ) : intake ? (
            <View style={[styles.pill, { backgroundColor: urgencyColors(intake.urgency ?? 'routine').bg }]}>
              <Text style={[styles.pillText, { color: urgencyColors(intake.urgency ?? 'routine').fg }]}>
                {t(`triageResults.urgency_${(intake.urgency ?? 'routine') as any}`)}
              </Text>
            </View>
          ) : (
            <View style={styles.pill}>
              <Text style={styles.pillText}>{t('home.noIntake')}</Text>
            </View>
          )}
        </View>

        {!!intake && (
          <>
            <Text style={[styles.helper, { marginBottom: 0, marginTop: 10 }]}>
              {t('home.answersCount', { n: intake.answers.length })}
            </Text>
            {situationTags.length > 0 && (
              <Text style={[styles.helper, { marginBottom: 0, marginTop: 6 }]}> 
                {t('home.situationTags')}: {situationTags.join(' • ')}
              </Text>
            )}
          </>
        )}
      </View>

      <View style={styles.mt16} />
      <View style={styles.card}>
        <Text style={styles.value}>{t('home.impactTitle')}</Text>
        <Text style={[styles.helper, { marginBottom: 0, marginTop: 10, color: colors.grey900 }]}>
          {lines.join('\n')}
        </Text>
        <Text style={[styles.helper, { marginBottom: 0, marginTop: 10 }]}>
          {t('home.impactDisclaimer')}
        </Text>
      </View>

      <View style={styles.mt16} />
      <View style={styles.card}>
        <Text style={styles.value}>{t('home.pastConsultations')}</Text>
        <Text style={[styles.helper, { marginBottom: 0 }]}>{t('home.pastConsultationsBody')}</Text>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}