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
import { styles, colors } from '../ui/styles';
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
          <View style={[styles.card, { marginTop: 16 }]}>
            <Text style={styles.value}>{t('triageResults.errorTitle')}</Text>
            <Text style={[styles.helper, { marginBottom: 0 }]}>{error}</Text>
          </View>
        )}

        {!loading && !error && !intake && (
          <View style={[styles.card, { marginTop: 16 }]}>
            <Text style={styles.value}>{t('triageResults.emptyTitle')}</Text>
            <Text style={[styles.helper, { marginBottom: 0 }]}>{t('triageResults.emptyBody')}</Text>
          </View>
        )}

        {!loading && !error && intake && (
          <>
            <Text style={[styles.label, { marginBottom: 12 }]}>{t('triageResults.urgency')}</Text>
            <View style={styles.card}>
              <View style={[styles.pill, { backgroundColor: urgencyColors(intake.urgency ?? 'routine').bg }]}>
                <Text style={[styles.pillText, { color: urgencyColors(intake.urgency ?? 'routine').fg }]}>
                  {t(`triageResults.urgency_${(intake.urgency ?? 'routine') as any}`)}
                </Text>
              </View>
            </View>
            <View style={styles.mt16} />

            {intake.summary && (
              <>
                <Text style={[styles.label, { marginBottom: 12 }]}>{t('triageResults.summary')}</Text>
                <View style={styles.card}>
                  <Text style={[styles.helper, { marginBottom: 0, color: colors.grey900 }]}>
                    {intake.summary}
                  </Text>
                </View>
                <View style={styles.mt16} />
              </>
            )}

            <Text style={[styles.label, { marginBottom: 12 }]}>{t('triageResults.answers')}</Text>
            {intake.answers.map((qa, idx) => (
              <View key={`${idx}:${qa.q}`} style={[styles.card, idx > 0 && styles.mt16]}>
                <Text style={styles.label}>{qa.q}</Text>
                <Text style={[styles.value, { marginTop: 6 }]}>{qa.a || t('common.dash')}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
