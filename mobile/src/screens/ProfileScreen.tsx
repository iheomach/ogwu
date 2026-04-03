import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';

import type { ProfileScreenProps } from '../types';
import { styles } from '../ui/styles';
import { languageLabels, t } from '../i18n';
import { SUPPORTED_LOCALES, type SupportedLocale } from '../i18n/translations';

function ProfileRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value?: string | null;
  last?: boolean;
}) {
  return (
    <View style={[styles.profileField, last && styles.profileFieldLast]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value ?? t('common.dash')}</Text>
    </View>
  );
}

export function ProfileScreen({
  busy,
  phoneLabel,
  profile,
  locale,
  onChangeLocale,
  onRunTriage,
  onViewTriageResults,
  onLogout,
}: ProfileScreenProps) {
  const displayFullName = [profile?.first_name, profile?.middle_name, profile?.last_name]
    .filter((p) => (p ?? '').trim().length > 0)
    .join(' ');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { justifyContent: 'flex-start' }]}>
        <View style={[styles.brandRow, { marginBottom: 16 }]}>
          <View style={styles.brandDot} />
          <Text style={styles.brandName}>{t('common.appName')}</Text>
        </View>

        <Text style={styles.title}>{t('profile.title')}</Text>
        <Text style={styles.helper}>{phoneLabel}</Text>

        <Text style={[styles.label, { marginBottom: 12 }]}>{t('profile.details')}</Text>
        <View style={styles.card}>
          <ProfileRow label={t('home.fullName')} value={displayFullName || null} />
          <ProfileRow label={t('home.dob')} value={profile?.dob} />
          <ProfileRow label={t('home.sex')} value={profile?.biological_sex} />
          <ProfileRow label={t('home.allergies')} value={profile?.allergies} />
          <ProfileRow label={t('home.conditions')} value={profile?.known_conditions} last />
        </View>

        <Text style={[styles.label, { marginBottom: 12 }]}>{t('home.language')}</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={locale}
            onValueChange={(v) => onChangeLocale(String(v) as SupportedLocale)}
            enabled={!busy}
            style={styles.picker}
          >
            {SUPPORTED_LOCALES.map((code) => (
              <Picker.Item key={code} label={languageLabels[code]} value={code} />
            ))}
          </Picker>
        </View>

        <Text style={[styles.label, { marginBottom: 12 }]}>{t('profile.intake')}</Text>
        <View style={styles.card}>
          <Text style={[styles.helper, { marginBottom: 16 }]}>{t('profile.intakeHelper')}</Text>

          <TouchableOpacity
            style={[styles.btnPrimary, busy && styles.btnPrimaryDisabled]}
            onPress={onRunTriage}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={styles.btnPrimaryText}>{t('profile.runTriage')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnGhost} onPress={onViewTriageResults} disabled={busy}>
            <Text style={styles.btnGhostText}>{t('profile.viewTriage')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.btnDestructive}
          onPress={onLogout}
          disabled={busy}
          activeOpacity={0.8}
        >
          <Text style={styles.btnDestructiveText}>{busy ? t('common.signingOut') : t('common.signOut')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
