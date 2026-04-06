import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { NewConsultScreenProps } from '../types';
import { apiGet } from '../lib/api';
import { encountersCreateShare } from '../lib/encounters';
import { providersLookup } from '../lib/providers';
import { threadsCreate } from '../lib/threads';
import { triageGetIntake, type TriageIntake } from '../lib/triage';
import { colors, styles } from '../ui/styles';
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

type Doctor = {
  id: string;
  name: string;
  title: string;
  primary_specialty: string;
  tags: string[];
  languages: string[];
  hospital_name: string;
  location: string;
  about: string;
  contact_phone?: string;
  contact_url?: string;
  price_guide?: { label: string; range: string }[];
  sort_rank?: number;
};

function normalizeDoctor(raw: any): Doctor {
  return {
    id: String(raw?.id || ''),
    name: String(raw?.name || ''),
    title: String(raw?.title || ''),
    primary_specialty: String(raw?.primary_specialty || ''),
    tags: Array.isArray(raw?.tags) ? raw.tags.map(String) : [],
    languages: Array.isArray(raw?.languages) ? raw.languages.map(String) : [],
    hospital_name: String(raw?.hospital_name || ''),
    location: String(raw?.location || ''),
    about: String(raw?.about || ''),
    contact_phone: raw?.contact_phone ? String(raw.contact_phone) : undefined,
    contact_url: raw?.contact_url ? String(raw.contact_url) : undefined,
    price_guide: Array.isArray(raw?.price_guide)
      ? raw.price_guide
          .filter((x: any) => x && typeof x === 'object')
          .map((x: any) => ({ label: String(x.label || ''), range: String(x.range || '') }))
          .filter((x: any) => x.label && x.range)
      : undefined,
    sort_rank: typeof raw?.sort_rank === 'number' ? raw.sort_rank : undefined,
  };
}

function buildClinicShareText(intake: TriageIntake): string {
  const urgencyKey = `triageResults.urgency_${(intake.urgency ?? 'routine') as any}`;
  const urgencyLabel = t(urgencyKey);

  const parts: string[] = [];
  parts.push(t('triageResults.shareHeader'));
  parts.push(`${t('triageResults.urgency')}: ${urgencyLabel}`);
  if (intake.summary) {
    parts.push('');
    parts.push(`${t('triageResults.summary')}:`);
    parts.push(intake.summary);
  }

  if (intake.safety_note) {
    parts.push('');
    parts.push(`${t('triageResults.safetyNote')}:`);
    parts.push(intake.safety_note);
  }
  parts.push('');
  parts.push(`${t('triageResults.answers')}:`);
  intake.answers.forEach((qa, idx) => {
    parts.push(`${idx + 1}. ${qa.q}`);
    parts.push(`${qa.a || t('common.dash')}`);
    parts.push('');
  });

  return parts.join('\n').trim();
}

export function NewConsultScreen({ busy, onViewIntake, onOpenThread }: NewConsultScreenProps) {
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [doctorsLoading, setDoctorsLoading] = useState(true);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [intakeLoading, setIntakeLoading] = useState(true);
  const [intake, setIntake] = useState<TriageIntake | null>(null);

  const [externalQuery, setExternalQuery] = useState('');
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalNotice, setExternalNotice] = useState<string | null>(null);
  const [externalProviders, setExternalProviders] = useState<any[]>([]);
  const [externalSuggested, setExternalSuggested] = useState<string[]>([]);

  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.id === selectedDoctorId) ?? null,
    [doctors, selectedDoctorId]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setDoctorsLoading(true);
        const res = await apiGet<{ doctors: any[] }>('/api/doctors');
        if (!mounted) return;
        const parsed = Array.isArray(res?.doctors) ? res.doctors.map(normalizeDoctor) : [];
        setDoctors(parsed.filter((d) => d.id && d.name));
      } catch (e: any) {
        if (!mounted) return;
        setDoctors([]);
        Alert.alert(t('consult.doctors'), e?.message || t('common.error'));
      } finally {
        if (mounted) setDoctorsLoading(false);
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

  const onShareIntake = async () => {
    if (!intake) return;
    try {
      const message = buildClinicShareText(intake);
      const res = await Share.share({ message, title: t('triageResults.shareTitle') });

      // Only record an encounter if the user actually shared.
      if ((res as any)?.action === Share.sharedAction) {
        try {
          // Server snapshots the latest intake; no PHI is posted from the client.
          await encountersCreateShare({ doctor_id: null });
        } catch (e: any) {
          Alert.alert(t('records.title'), e?.message ?? t('common.error'));
        }
      }
    } catch (e: any) {
      Alert.alert(t('triageResults.shareErrorTitle'), e?.message ?? t('triageResults.shareErrorBody'));
    }
  };

  const onContactHospital = async (doctor: Doctor) => {
    const url = doctor.contact_url?.trim();
    const phone = doctor.contact_phone?.trim();
    try {
      if (url && url.length > 0) {
        await Linking.openURL(url);
        return;
      }
      if (phone && phone.length > 0) {
        await Linking.openURL(`tel:${phone}`);
        return;
      }
      Alert.alert(t('consult.contactMissingTitle'), t('consult.contactMissingBody'));
    } catch (e: any) {
      Alert.alert(t('consult.contactErrorTitle'), e?.message ?? t('consult.contactErrorBody'));
    }
  };

  const urgencyLabel = intake
    ? t(`triageResults.urgency_${(intake.urgency ?? 'routine') as any}`)
    : t('common.dash');

  const urgencyStyle = intake ? urgencyColors(intake.urgency ?? 'routine') : null;

  const onStartAsyncConsult = async (doctorId: string) => {
    try {
      const res = await threadsCreate({ doctor_id: doctorId });
      const threadId = res?.thread?.id;
      if (!threadId) throw new Error(t('common.error'));
      onOpenThread(threadId);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? t('common.error'));
    }
  };

  const onLookupExternal = async () => {
    const q = externalQuery.trim();
    if (!q) return;
    try {
      setExternalLoading(true);
      setExternalNotice(null);
      setExternalProviders([]);
      setExternalSuggested([]);
      const res = await providersLookup(q);
      setExternalNotice(res.notice ?? null);
      setExternalProviders(Array.isArray((res as any)?.providers) ? (res as any).providers : []);
      setExternalSuggested(Array.isArray((res as any)?.suggested_queries) ? (res as any).suggested_queries : []);
    } catch (e: any) {
      setExternalNotice(e?.message ?? t('common.error'));
      setExternalProviders([]);
      setExternalSuggested([]);
    } finally {
      setExternalLoading(false);
    }
  };

  const buildExternalMessage = () => {
    if (intake) return buildClinicShareText(intake);
    return t('consult.externalDefaultMessage');
  };

  const openSms = async (phone: string) => {
    const message = buildExternalMessage();
    const sep = Platform.OS === 'ios' ? '&' : '?';
    const url = `sms:${phone}${sep}body=${encodeURIComponent(message)}`;
    await Linking.openURL(url);
  };

  const openEmail = async (email: string) => {
    const body = buildExternalMessage();
    const subject = encodeURIComponent(t('consult.externalEmailSubject'));
    const url = `mailto:${email}?subject=${subject}&body=${encodeURIComponent(body)}`;
    await Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { justifyContent: 'flex-start', opacity: busy ? 0.7 : 1 }]}
      >
        {selectedDoctor ? (
          <TouchableOpacity style={styles.btnGhost} onPress={() => setSelectedDoctorId(null)} disabled={busy}>
            <Text style={styles.btnGhostText}>{t('consult.backToDoctors')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.brandRow, { marginBottom: 16 }]}>
            <View style={styles.brandDot} />
            <Text style={styles.brandName}>{t('common.appName')}</Text>
          </View>
        )}

        {!selectedDoctor && (
          <>
            <Text style={styles.title}>{t('consult.title')}</Text>
            <Text style={styles.helper}>{t('consult.helper')}</Text>

            <Text style={[styles.label, { marginBottom: 12 }]}>{t('consult.intakeReady')}</Text>
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View>
                  <Text style={styles.value}>{t('triageResults.urgency')}</Text>
                  {intakeLoading ? (
                    <View style={[styles.row, { marginTop: 6 }]}>
                      <ActivityIndicator color={colors.purple} />
                      <Text style={[styles.helper, { marginBottom: 0, marginLeft: 10 }]}>{t('triage.loading')}</Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.pill,
                        { marginTop: 8, backgroundColor: urgencyStyle?.bg ?? colors.purpleLight },
                      ]}
                    >
                      <Text style={[styles.pillText, { color: urgencyStyle?.fg ?? colors.purple }]}>
                        {urgencyLabel}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {intake && intake.urgency === 'emergency' && (
                <View style={[styles.mt16, { backgroundColor: colors.errorLight, borderRadius: 12, padding: 12 }]}
                >
                  <Text style={[styles.helper, { marginBottom: 0, color: colors.grey900 }]}>
                    {t('consult.emergencyBody')}
                  </Text>
                </View>
              )}

              <View style={[styles.row, { marginTop: 14 }]}>
                <TouchableOpacity
                  style={[styles.btnDestructive, { flex: 1, marginTop: 0, marginRight: 10 }]}
                  onPress={onViewIntake}
                  disabled={busy || !intake}
                >
                  <Text style={[styles.btnDestructiveText, { color: colors.grey700 }]}>{t('consult.viewIntake')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btnPrimary, { flex: 1, marginTop: 0 }]}
                  onPress={onShareIntake}
                  disabled={busy || !intake}
                >
                  <Text style={styles.btnPrimaryText}>{t('consult.shareIntake')}</Text>
                </TouchableOpacity>
              </View>

              {!intakeLoading && !intake && (
                <Text style={[styles.helper, { marginTop: 12, marginBottom: 0 }]}>
                  {t('consult.noIntakeBody')}
                </Text>
              )}
            </View>

            <View style={styles.mt24} />
            <Text style={[styles.label, { marginBottom: 12 }]}>{t('consult.doctors')}</Text>

            {doctorsLoading && (
              <View style={[styles.row, { marginTop: 6, marginBottom: 10 }]}> 
                <ActivityIndicator color={colors.purple} />
                <Text style={[styles.helper, { marginBottom: 0, marginLeft: 10 }]}>{t('triage.loading')}</Text>
              </View>
            )}

            {!doctorsLoading && doctors.length === 0 && (
              <Text style={[styles.helper, { marginBottom: 0 }]}>{t('common.tryAgain')}</Text>
            )}

            {doctors.map((doc, idx) => (
              <TouchableOpacity
                key={doc.id}
                style={[styles.card, idx > 0 && styles.mt16]}
                onPress={() => setSelectedDoctorId(doc.id)}
                disabled={busy}
                activeOpacity={0.9}
              >
                <Text style={styles.value}>
                  {doc.name} {doc.title ? `• ${doc.title}` : ''}
                </Text>
                <Text style={[styles.helper, { marginBottom: 10 }]}>
                  {doc.primary_specialty}
                  {doc.tags.length > 0 ? ` • ${doc.tags.slice(0, 2).join(' • ')}` : ''}
                </Text>

                <View style={styles.rowBetween}>
                  <Text style={[styles.helper, { marginBottom: 0, flex: 1, marginRight: 12 }]} numberOfLines={1}>
                    {doc.hospital_name} • {doc.location}
                  </Text>
                  <View style={[styles.pill, { maxWidth: '45%' }]}>
                    <Text style={styles.pillText} numberOfLines={1} ellipsizeMode="tail">
                      {doc.languages.slice(0, 2).join(' / ')}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            <View style={styles.mt24} />
            <Text style={[styles.label, { marginBottom: 12 }]}>{t('consult.externalProviders')}</Text>
            <View style={styles.card}>
              <Text style={[styles.helper, { marginBottom: 12 }]}>{t('consult.externalProvidersBody')}</Text>

              <Text style={styles.inputLabel}>{t('consult.externalSearchLabel')}</Text>
              <TextInput
                value={externalQuery}
                onChangeText={setExternalQuery}
                placeholder={t('consult.externalSearchPlaceholder')}
                placeholderTextColor={colors.grey300}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                editable={!busy && !externalLoading}
              />

              <TouchableOpacity
                style={[styles.btnPrimary, (busy || externalLoading || externalQuery.trim().length === 0) && styles.btnPrimaryDisabled]}
                onPress={onLookupExternal}
                disabled={busy || externalLoading || externalQuery.trim().length === 0}
                activeOpacity={0.85}
              >
                <Text style={styles.btnPrimaryText}>
                  {externalLoading ? t('triage.loading') : t('consult.externalSearchCta')}
                </Text>
              </TouchableOpacity>

              {!!externalNotice && (
                <Text style={[styles.helper, { marginBottom: 0, marginTop: 10 }]}>{externalNotice}</Text>
              )}

              {!externalLoading && externalSuggested.length > 0 && (
                <View style={styles.mt16}>
                  <Text style={[styles.helper, { marginBottom: 0 }]}>{t('consult.externalSuggested')}</Text>
                  {externalSuggested.slice(0, 3).map((s) => (
                    <Text key={s} style={[styles.helper, { marginBottom: 0, marginTop: 6 }]}>
                      • {s}
                    </Text>
                  ))}
                </View>
              )}

              {externalProviders.length > 0 && (
                <View style={styles.mt16}>
                  {externalProviders.map((p: any, i: number) => (
                    <View key={`${p?.source_url || p?.website || p?.phone || 'p'}:${i}`} style={[styles.card, i > 0 && styles.mt16]}>
                      <Text style={styles.value}>{String(p?.name || t('consult.externalProvider'))}</Text>
                      {!!p?.address && (
                        <Text style={[styles.helper, { marginBottom: 0, marginTop: 6 }]}>{String(p.address)}</Text>
                      )}

                      {!!p?.phone && (
                        <Text style={[styles.helper, { marginBottom: 0, marginTop: 6 }]}>
                          {t('consult.phone')}: {String(p.phone)}
                        </Text>
                      )}
                      {!!p?.email && (
                        <Text style={[styles.helper, { marginBottom: 0, marginTop: 6 }]}>
                          {t('consult.email')}: {String(p.email)}
                        </Text>
                      )}

                      <View style={[styles.row, { marginTop: 12, flexWrap: 'wrap' }]}>
                        {!!p?.phone && (
                          <TouchableOpacity
                            style={[styles.btnGhost, { marginRight: 10, marginTop: 0 }]}
                            onPress={() => Linking.openURL(`tel:${String(p.phone)}`)}
                            disabled={busy}
                          >
                            <Text style={styles.btnGhostText}>{t('consult.call')}</Text>
                          </TouchableOpacity>
                        )}

                        {!!p?.phone && (
                          <TouchableOpacity
                            style={[styles.btnGhost, { marginRight: 10, marginTop: 0 }]}
                            onPress={() => openSms(String(p.phone))}
                            disabled={busy}
                          >
                            <Text style={styles.btnGhostText}>{t('consult.text')}</Text>
                          </TouchableOpacity>
                        )}

                        {!!p?.email && (
                          <TouchableOpacity
                            style={[styles.btnGhost, { marginRight: 10, marginTop: 0 }]}
                            onPress={() => openEmail(String(p.email))}
                            disabled={busy}
                          >
                            <Text style={styles.btnGhostText}>{t('consult.email')}</Text>
                          </TouchableOpacity>
                        )}

                        {!!p?.booking_url && (
                          <TouchableOpacity
                            style={[styles.btnGhost, { marginTop: 0 }]}
                            onPress={() => Linking.openURL(String(p.booking_url))}
                            disabled={busy}
                          >
                            <Text style={styles.btnGhostText}>{t('consult.openBooking')}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}

        {selectedDoctor && (
          <>
            <Text style={styles.title}>{selectedDoctor.name}</Text>
            <Text style={styles.helper}>
              {selectedDoctor.primary_specialty}
              {selectedDoctor.tags.length > 0 ? ` • ${selectedDoctor.tags.join(' • ')}` : ''}
            </Text>

            <Text style={[styles.label, { marginBottom: 12 }]}>{t('consult.hospital')}</Text>
            <View style={styles.card}>
              <Text style={styles.value}>{selectedDoctor.hospital_name}</Text>
              <Text style={[styles.helper, { marginBottom: 0 }]}>{selectedDoctor.location}</Text>
            </View>

            <Text style={[styles.label, { marginBottom: 12 }]}>{t('consult.aboutDoctor')}</Text>
            <View style={styles.card}>
              <Text style={[styles.helper, { marginBottom: 0, color: colors.grey900 }]}>
                {selectedDoctor.about}
              </Text>
            </View>

            <Text style={[styles.label, { marginBottom: 12 }]}>{t('consult.howItWorks')}</Text>
            <View style={styles.card}>
              <Text style={[styles.helper, { marginBottom: 0, color: colors.grey900 }]}>
                {t('consult.howItWorksBody')}
              </Text>
            </View>

            {selectedDoctor.price_guide && selectedDoctor.price_guide.length > 0 && (
              <>
                <Text style={[styles.label, { marginBottom: 12 }]}>{t('consult.priceGuide')}</Text>
                <View style={styles.card}>
                  {selectedDoctor.price_guide.map((row, i) => (
                    <View
                      key={`${selectedDoctor.id}:${i}:${row.label}`}
                      style={[styles.profileField, i === selectedDoctor.price_guide!.length - 1 && styles.profileFieldLast]}
                    >
                      <Text style={[styles.label, { marginTop: 0 }]}>{row.label}</Text>
                      <Text style={[styles.value, { marginTop: 4 }]}>{row.range}</Text>
                    </View>
                  ))}
                  <Text style={[styles.helper, { marginBottom: 0, marginTop: 10 }]}>
                    {t('consult.priceGuideDisclaimer')}
                  </Text>
                </View>
              </>
            )}

            <TouchableOpacity
              style={[styles.btnPrimary, busy ? styles.btnPrimaryDisabled : null]}
              onPress={() => onContactHospital(selectedDoctor)}
              disabled={busy}
            >
              <Text style={styles.btnPrimaryText}>{t('consult.contactHospital')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnPrimary, busy ? styles.btnPrimaryDisabled : null]}
              onPress={() => onStartAsyncConsult(selectedDoctor.id)}
              disabled={busy}
            >
              <Text style={styles.btnPrimaryText}>{t('consult.startAsyncConsult')}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
