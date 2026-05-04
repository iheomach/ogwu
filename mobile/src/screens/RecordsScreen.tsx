import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RecordsScreenProps } from '../types';
import type { ConsultThread, Encounter, UrgencyTier } from '../types';
import { encountersList } from '../lib/encounters';
import { threadsList } from '../lib/threads';
import { fetchReport, buildReportText } from '../lib/report';
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

function toRoman(n: number): string {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
  let out = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { out += syms[i]; n -= vals[i]; }
  }
  return out;
}

function conditionBase(th: ConsultThread): string {
  const s = (th.intake_snapshot?.summary ?? '').trim();
  if (s) return s.split(/\s+/).slice(0, 6).join(' ');
  if (th.provider_type === 'external') return th.external_provider?.name ?? 'External provider';
  if (th.doctor?.name) return th.doctor.name;
  return 'Async consult';
}

function buildThreadTitles(threads: ConsultThread[]): Map<string, string> {
  // Patient's own threads — group by base condition title only
  const groups = new Map<string, ConsultThread[]>();
  for (const th of threads) {
    const base = conditionBase(th);
    const g = groups.get(base) ?? [];
    g.push(th);
    groups.set(base, g);
  }

  const result = new Map<string, string>();
  for (const [base, group] of groups) {
    if (group.length === 1) {
      result.set(group[0].id, base);
    } else {
      // threads arrive newest-first; sort ascending so oldest = I
      const sorted = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at));
      sorted.forEach((th, i) => result.set(th.id, `${base} ${toRoman(i + 1)}`));
    }
  }
  return result;
}

export function RecordsScreen({ busy, onOpenThread }: RecordsScreenProps) {
  const [loading, setLoading] = useState(true);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [encountersError, setEncountersError] = useState<string | null>(null);

  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threads, setThreads] = useState<ConsultThread[]>([]);
  const [threadsError, setThreadsError] = useState<string | null>(null);

  const [exportLoading, setExportLoading] = useState(false);

  const handleExport = async () => {
    if (exportLoading) return;
    try {
      setExportLoading(true);
      const data = await fetchReport();
      const message = buildReportText(data);
      await Share.share({ message, title: t('records.exportTitle') });
    } catch (e: any) {
      Alert.alert(t('records.exportErrorTitle'), e?.message ?? t('records.exportErrorBody'));
    } finally {
      setExportLoading(false);
    }
  };

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
  const threadTitles = useMemo(() => buildThreadTitles(threads), [threads]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { justifyContent: 'flex-start', opacity: busy ? 0.7 : 1 }]}
      >
        <Text style={styles.title}>{t('records.title')}</Text>
        <Text style={styles.helper}>{t('records.helper')}</Text>

        <TouchableOpacity
          style={[styles.btnPrimary, (busy || exportLoading) ? styles.btnPrimaryDisabled : null, { marginBottom: 24 }]}
          onPress={handleExport}
          disabled={busy || exportLoading}
        >
          {exportLoading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnPrimaryText}>{t('records.exportReport')}</Text>
          }
        </TouchableOpacity>

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
            <Text style={[styles.helper, { marginBottom: 0, marginTop: 16 }]}>{t('records.asyncEmpty')}</Text>
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
                    {threadTitles.get(th.id) ?? conditionBase(th)}
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
          <View style={[styles.card, styles.mt16]}>
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
