import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RecordsScreenProps } from '../types';
import type { ConsultThread, Encounter, TriageIntake, UrgencyTier } from '../types';
import { encountersList } from '../lib/encounters';
import { threadsList } from '../lib/threads';
import { triageGetIntake } from '../lib/triage';
import { styles, colors } from '../ui/styles';
import { t } from '../i18n';

function urgencyColors(urgency: UrgencyTier) {
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

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

export function RecordsScreen({ busy, onOpenThread }: RecordsScreenProps) {
  const [loading, setLoading] = useState(true);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [encountersError, setEncountersError] = useState<string | null>(null);

  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threads, setThreads] = useState<ConsultThread[]>([]);
  const [threadsError, setThreadsError] = useState<string | null>(null);

  const [intakeLoading, setIntakeLoading] = useState(true);
  const [intake, setIntake] = useState<TriageIntake | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setEncountersError(null);
        const res = await encountersList();
        if (!mounted) return;
        setEncounters(Array.isArray(res.encounters) ? res.encounters : []);
      } catch {
        if (!mounted) return;
        setEncounters([]);
        setEncountersError(t('common.error'));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setThreadsLoading(true);
        setThreadsError(null);
        const res = await threadsList();
        if (!mounted) return;
        setThreads(Array.isArray(res.threads) ? res.threads : []);
      } catch {
        if (!mounted) return;
        setThreads([]);
        setThreadsError(t('common.error'));
      } finally {
        if (mounted) setThreadsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

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

  const hasAny = useMemo(() => encounters.length > 0, [encounters.length]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { justifyContent: 'flex-start', opacity: busy ? 0.7 : 1 }]}
      >
        <View style={[styles.brandRow, { marginBottom: 16 }]}>
          <View style={styles.brandDot} />
          <Text style={styles.brandName}>{t('common.appName')}</Text>
        </View>

        <Text style={styles.title}>{t('records.title')}</Text>
        <Text style={styles.helper}>{t('records.helper')}</Text>

        <Text style={[styles.label, { marginBottom: 12 }]}>{t('records.aiTriage')}</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.value}>{t('records.latestIntake')}</Text>
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

          {intake?.summary ? (
            <Text style={[styles.helper, { marginBottom: 0, marginTop: 10, color: colors.grey900 }]}>
              {intake.summary}
            </Text>
          ) : (
            <Text style={[styles.helper, { marginBottom: 0, marginTop: 10 }]}>
              {t('triageResults.emptyBody')}
            </Text>
          )}

          {intake?.safety_note ? (
            <Text style={[styles.helper, { marginBottom: 0, marginTop: 10 }]}> 
              {t('triageResults.safetyNote')}: {intake.safety_note}
            </Text>
          ) : null}
        </View>

        <View style={styles.mt24} />
        <Text style={[styles.label, { marginBottom: 12 }]}>{t('records.doctorVisits')}</Text>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.value}>{t('records.asyncConsults')}</Text>
            {threadsLoading ? <ActivityIndicator color={colors.purple} /> : null}
          </View>

          {!threadsLoading && threadsError && (
            <Text style={[styles.helper, { marginBottom: 0, marginTop: 10 }]}>{threadsError}</Text>
          )}

          {!threadsLoading && !threadsError && threads.length === 0 && (
            <Text style={[styles.helper, { marginBottom: 0, marginTop: 10 }]}>{t('records.asyncEmpty')}</Text>
          )}

          {!threadsLoading && !threadsError && threads.length > 0 && (
            <View style={styles.mt16}>
              {threads.slice(0, 5).map((th, idx) => (
                <TouchableOpacity
                  key={th.id}
                  style={[styles.card, idx > 0 && styles.mt16]}
                  onPress={() => onOpenThread(th.id)}
                  disabled={busy}
                  activeOpacity={0.9}
                >
                  <Text style={styles.value}>
                    {th.provider_type === 'external'
                      ? th.external_provider?.name || t('thread.externalTitle')
                      : th.doctor?.name || t('thread.title')}
                  </Text>
                  <Text style={[styles.helper, { marginBottom: 0, marginTop: 6 }]}>
                    {formatDate(th.created_at)} • {t(`triageResults.urgency_${(th.urgency ?? 'routine') as any}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {loading && (
          <View style={[styles.center, { paddingHorizontal: 0, paddingVertical: 24 }]}>
            <ActivityIndicator color={colors.purple} />
          </View>
        )}

        {!loading && encountersError && (
          <View style={styles.card}>
            <Text style={styles.value}>{t('common.error')}</Text>
            <Text style={[styles.helper, { marginBottom: 0 }]}>{encountersError}</Text>
          </View>
        )}

        {!loading && !encountersError && !hasAny && (
          <View style={styles.card}>
            <Text style={styles.value}>{t('records.emptyTitle')}</Text>
            <Text style={[styles.helper, { marginBottom: 0 }]}>{t('records.emptyBody')}</Text>
          </View>
        )}

        {!loading && !encountersError && hasAny && (
          <>
            {encounters.map((e, idx) => (
              <View key={e.id} style={[styles.card, idx > 0 && styles.mt16]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.value}>{t('records.encounterLabel')}</Text>
                  <View style={[styles.pill, { backgroundColor: urgencyColors(e.urgency).bg }]}>
                    <Text style={[styles.pillText, { color: urgencyColors(e.urgency).fg }]}>
                      {t(`triageResults.urgency_${(e.urgency ?? 'routine') as any}`)}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.helper, { marginBottom: 0, marginTop: 8 }]}>
                  {formatDate(e.created_at)}
                </Text>

                {e.doctor?.name ? (
                  <Text style={[styles.helper, { marginBottom: 0, marginTop: 6 }]}> 
                    {e.doctor.name} • {e.doctor.hospital_name} • {e.doctor.location}
                  </Text>
                ) : (
                  <Text style={[styles.helper, { marginBottom: 0, marginTop: 6 }]}> 
                    {t('records.sharedIntake')}
                  </Text>
                )}

                {e.summary ? (
                  <Text style={[styles.helper, { marginBottom: 0, marginTop: 10, color: colors.grey900 }]}> 
                    {e.summary}
                  </Text>
                ) : null}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
