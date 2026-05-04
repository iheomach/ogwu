import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SendToHospitalScreenProps } from '../types';
import { hospitalsList, type Hospital } from '../lib/hospitals';
import { triageGetIntake, type TriageIntake } from '../lib/triage';
import { threadsCreate } from '../lib/threads';
import { colors, styles } from '../ui/styles';
import { t } from '../i18n';

function urgencyColors(urgency: TriageIntake['urgency']) {
  switch (urgency) {
    case 'emergency': return { bg: colors.errorLight, fg: colors.error };
    case 'urgent':    return { bg: colors.urgentLight, fg: colors.urgent };
    case 'soon':      return { bg: colors.warningLight, fg: colors.warning };
    default:          return { bg: colors.successLight, fg: colors.success };
  }
}

export function SendToHospitalScreen({ busy, onBack, onSent }: SendToHospitalScreenProps) {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [filtered, setFiltered] = useState<Hospital[]>([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(true);
  const [intake, setIntake] = useState<TriageIntake | null>(null);
  const [intakeLoading, setIntakeLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null); // hospital id being sent to
  const [search, setSearch] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [hospRes, intakeRes] = await Promise.all([
          hospitalsList(),
          triageGetIntake().catch(() => ({ intake: null })),
        ]);
        if (!mounted) return;
        setHospitals(hospRes.hospitals);
        setFiltered(hospRes.hospitals);
        setIntake(intakeRes.intake);
      } catch (e: any) {
        if (!mounted) return;
        Alert.alert(t('common.error'), e?.message ?? t('common.error'));
      } finally {
        if (mounted) {
          setHospitalsLoading(false);
          setIntakeLoading(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const q = search.toLowerCase().trim();
    if (!q) { setFiltered(hospitals); return; }
    setFiltered(hospitals.filter(h =>
      h.name.toLowerCase().includes(q) ||
      (h.location ?? '').toLowerCase().includes(q) ||
      (h.admin1 ?? '').toLowerCase().includes(q)
    ));
  }, [search, hospitals]);

  const onSend = async (hospital: Hospital) => {
    if (sending) return;
    Alert.alert(
      'Send to ' + hospital.name + '?',
      'Your health summary will be sent to this hospital for review.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            try {
              setSending(hospital.id);
              const res = await threadsCreate({ hospital_id: hospital.id });
              const threadId = res?.thread?.id;
              if (!threadId) throw new Error(t('common.error'));
              onSent(threadId);
            } catch (e: any) {
              Alert.alert(t('common.error'), e?.message ?? t('common.error'));
            } finally {
              setSending(null);
            }
          },
        },
      ]
    );
  };

  const urgencyStyle = intake ? urgencyColors(intake.urgency ?? 'routine') : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { justifyContent: 'flex-start', opacity: busy ? 0.7 : 1 }]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.btnGhost} onPress={onBack} disabled={busy || !!sending}>
          <Text style={styles.btnGhostText}>{t('common.back')}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Send to Hospital</Text>
        <Text style={styles.helper}>
          Your health summary will be sent to the hospital's care team for review. They can respond directly in the app.
        </Text>

        {/* Intake summary card */}
        {!intakeLoading && intake && (
          <>
            <Text style={[styles.label, { marginBottom: 8 }]}>Your summary</Text>
            <View style={[styles.card, { marginBottom: 24 }]}>
              <View style={[styles.pill, { backgroundColor: urgencyStyle?.bg, alignSelf: 'flex-start', marginBottom: 8 }]}>
                <Text style={[styles.pillText, { color: urgencyStyle?.fg }]}>
                  {t(`triageResults.urgency_${(intake.urgency ?? 'routine') as any}`)}
                </Text>
              </View>
              {intake.summary ? (
                <Text style={[styles.helper, { marginBottom: 0, color: colors.grey900 }]} numberOfLines={4}>
                  {intake.summary}
                </Text>
              ) : null}
            </View>
          </>
        )}

        {/* Search */}
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search hospitals..."
          placeholderTextColor={colors.grey300}
          autoCorrect={false}
          style={[styles.input, { marginBottom: 16 }]}
          editable={!busy && !hospitalsLoading}
        />

        {/* Hospital list */}
        {hospitalsLoading ? (
          <View style={[styles.row, { paddingVertical: 16 }]}>
            <ActivityIndicator color={colors.purple} />
            <Text style={[styles.helper, { marginLeft: 10, marginBottom: 0 }]}>{t('triage.loading')}</Text>
          </View>
        ) : filtered.length === 0 ? (
          <Text style={[styles.helper, { marginBottom: 0 }]}>No hospitals found.</Text>
        ) : (
          filtered.map((h, idx) => (
            <TouchableOpacity
              key={h.id}
              style={[styles.card, idx > 0 && styles.mt16]}
              onPress={() => onSend(h)}
              disabled={busy || !!sending}
              activeOpacity={0.85}
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.value}>{h.name}</Text>
                  <Text style={[styles.helper, { marginBottom: 0, marginTop: 4 }]}>
                    {[h.location, h.admin1, h.country].filter(Boolean).join(' · ')}
                  </Text>
                  {h.specialty_tags && h.specialty_tags.length > 0 && (
                    <Text style={[styles.helper, { marginBottom: 0, marginTop: 4, color: colors.purple, fontSize: 12 }]}>
                      {h.specialty_tags.slice(0, 3).join(' · ')}
                    </Text>
                  )}
                </View>
                {sending === h.id ? (
                  <ActivityIndicator color={colors.purple} />
                ) : (
                  <View style={[styles.pill, { backgroundColor: colors.purpleLight }]}>
                    <Text style={[styles.pillText, { color: colors.purple }]}>Send</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
