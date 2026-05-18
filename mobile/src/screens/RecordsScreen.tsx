import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RecordsScreenProps } from '../types';
import type { ConsultThread } from '../types';
import { threadsList, threadsClose } from '../lib/threads';
import { fetchReport, buildReportText } from '../lib/report';
import { styles, colors } from '../ui/styles';
import { t } from '../i18n';

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
  if (th.title) return th.title;
  if (th.provider_type === 'external') return th.external_provider?.name ?? 'External provider';
  if (th.doctor?.name) return th.doctor.name;
  const urgency = th.urgency ?? th.intake_snapshot?.urgency;
  if (urgency && urgency !== 'routine') return `${urgency.charAt(0).toUpperCase() + urgency.slice(1)} consult`;
  return 'Async consult';
}

function buildThreadTitles(threads: ConsultThread[]): Map<string, string> {
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
      const sorted = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at));
      sorted.forEach((th, i) => result.set(th.id, `${base} ${toRoman(i + 1)}`));
    }
  }
  return result;
}

export function RecordsScreen({ busy, onOpenThread }: RecordsScreenProps) {
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threads, setThreads] = useState<ConsultThread[]>([]);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'inactive'>('active');
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setThreadsLoading(true);
        setThreadsError(null);
        const res = await threadsList();
        if (!mounted) return;
        setThreads(Array.isArray(res.threads) ? res.threads : []);
      } catch (e: any) {
        if (!mounted) return;
        setThreads([]);
        setThreadsError(e?.message ?? t('common.error'));
      } finally {
        if (mounted) setThreadsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleCloseThread = (th: ConsultThread) => {
    Alert.alert(
      'End conversation?',
      'This will close the thread for both you and the provider. Neither party will be able to send messages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End conversation',
          style: 'destructive',
          onPress: async () => {
            setThreads(prev => prev.map(t => t.id === th.id ? { ...t, status: 'closed' } : t));
            try {
              await threadsClose(th.id);
            } catch (e: any) {
              setThreads(prev => prev.map(t => t.id === th.id ? { ...t, status: 'open' } : t));
              Alert.alert(t('common.error'), e?.message ?? t('common.error'));
            }
          },
        },
      ]
    );
  };

  const threadTitles = useMemo(() => buildThreadTitles(threads), [threads]);
  const activeThreads = useMemo(() => threads.filter(t => t.status === 'open'), [threads]);
  const inactiveThreads = useMemo(() => threads.filter(t => t.status === 'closed'), [threads]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
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

          {/* Active / Inactive tabs */}
          {!threadsLoading && !threadsError && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {(['active', 'inactive'] as const).map(tab => {
                const isSelected = activeTab === tab;
                const count = tab === 'active' ? activeThreads.length : inactiveThreads.length;
                const dotColor = tab === 'active' ? colors.success : colors.error;
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
                      borderColor: isSelected ? dotColor : 'rgba(0,0,0,0.07)',
                      backgroundColor: isSelected
                        ? (tab === 'active' ? colors.successLight : colors.errorLight)
                        : 'transparent',
                    }}
                  >
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dotColor }} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: isSelected ? dotColor : colors.grey500, textTransform: 'capitalize' }}>
                      {tab}
                    </Text>
                    {count > 0 && (
                      <View style={{
                        backgroundColor: dotColor,
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

          {!threadsLoading && threadsError && (
            <Text style={[styles.helper, { marginBottom: 0, marginTop: 10 }]}>{threadsError}</Text>
          )}

          {!threadsLoading && !threadsError && (() => {
            const list = activeTab === 'active' ? activeThreads : inactiveThreads;
            if (list.length === 0) {
              return (
                <Text style={[styles.helper, { marginBottom: 0, marginTop: 16 }]}>
                  {activeTab === 'active' ? 'No active consults.' : 'No past consults.'}
                </Text>
              );
            }
            return (
              <View style={styles.mt16}>
                {list.slice(0, 5).map((th, idx) => (
                  <View
                    key={th.id}
                    style={[styles.card, idx > 0 && styles.mt16, { flexDirection: 'row', padding: 0, overflow: 'hidden' }]}
                  >
                    <TouchableOpacity
                      style={{ flex: 1, padding: 14 }}
                      onPress={() => onOpenThread(th.id)}
                      disabled={busy}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.value}>
                        {threadTitles.get(th.id) ?? conditionBase(th)}
                      </Text>
                      <Text style={[styles.helper, { marginBottom: 0, marginTop: 6 }]}>
                        {formatDate(th.created_at)} • {t(`triageResults.urgency_${(th.urgency ?? 'routine') as any}`)}
                      </Text>
                    </TouchableOpacity>

                    {activeTab === 'active' && (
                      <>
                        <View style={{ width: 1, backgroundColor: colors.purple }} />
                        <TouchableOpacity
                          style={{ paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center' }}
                          onPress={() => handleCloseThread(th)}
                          disabled={busy}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        >
                          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.purple }}>✕</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ))}
              </View>
            );
          })()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
