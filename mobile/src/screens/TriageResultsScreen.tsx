import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TriageIntake, TriageResultsScreenProps } from '../types';
import { styles, colors, spacing } from '../ui/styles';
import { GlassCard } from '../ui/GlassCard';
import { t } from '../i18n';
import { triageGetIntake } from '../lib/triage';

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

export function TriageResultsScreen({ busy, onBack }: TriageResultsScreenProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intake, setIntake] = useState<TriageIntake | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await triageGetIntake();
        if (!mounted) return;
        setIntake(res.intake);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? 'Failed to load triage intake');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { justifyContent: 'flex-start', opacity: busy ? 0.7 : 1 }]}
      >
        <TouchableOpacity style={styles.btnGhost} onPress={onBack} disabled={busy}>
          <Text style={styles.btnGhostText}>{t('common.back')}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{t('triageResults.title')}</Text>
        <Text style={styles.helper}>{t('triageResults.helper')}</Text>

        {loading && (
          <View style={[styles.center, { paddingHorizontal: 0, paddingVertical: 24, marginTop: 16 }]}>
            <ActivityIndicator color={colors.purple} />
          </View>
        )}

        {!loading && error && (
          <GlassCard style={{ marginTop: 16 }} innerStyle={{ padding: spacing.lg }}>
            <Text style={styles.value}>{t('triageResults.errorTitle')}</Text>
            <Text style={[styles.helper, { marginBottom: 0 }]}>{error}</Text>
          </GlassCard>
        )}

        {!loading && !error && !intake && (
          <GlassCard style={{ marginTop: 16 }} innerStyle={{ padding: spacing.lg }}>
            <Text style={styles.value}>{t('triageResults.emptyTitle')}</Text>
            <Text style={[styles.helper, { marginBottom: 0 }]}>{t('triageResults.emptyBody')}</Text>
          </GlassCard>
        )}

        {!loading && !error && intake && (
          <>
            <Text style={[styles.label, { marginBottom: 12 }]}>{t('triageResults.urgency')}</Text>
            <GlassCard innerStyle={{ padding: spacing.lg }}>
              <View style={[styles.pill, { backgroundColor: urgencyColors(intake.urgency ?? 'routine').bg }]}>
                <Text style={[styles.pillText, { color: urgencyColors(intake.urgency ?? 'routine').fg }]}>
                  {t(`triageResults.urgency_${(intake.urgency ?? 'routine') as any}`)}
                </Text>
              </View>
            </GlassCard>
            <View style={styles.mt16} />

            {intake.summary && (
              <>
                <Text style={[styles.label, { marginBottom: 12 }]}>{t('triageResults.summary')}</Text>
                <GlassCard innerStyle={{ padding: spacing.lg }}>
                  <Text style={[styles.helper, { marginBottom: 0, color: colors.grey900 }]}>
                    {intake.summary}
                  </Text>
                </GlassCard>
                <View style={styles.mt16} />
              </>
            )}

            <Text style={[styles.label, { marginBottom: 12 }]}>{t('triageResults.answers')}</Text>
            {intake.answers.map((qa, idx) => (
              <GlassCard key={`${idx}:${qa.q}`} style={idx > 0 ? { marginTop: spacing.md } : undefined} innerStyle={{ padding: spacing.lg }}>
                <Text style={styles.label}>{qa.q}</Text>
                <Text style={[styles.value, { marginTop: 6 }]}>{qa.a || t('common.dash')}</Text>
              </GlassCard>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
