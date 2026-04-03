import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { HomeScreenProps } from '../types';
import { styles } from '../ui/styles';
import { t } from '../i18n';

export function HomeScreen({
  busy,
  phoneLabel,
  profile,
  onGoNewConsult,
  onGoRecords,
  onGoProfile,
}: HomeScreenProps) {
  const displayFirstName =
    profile?.first_name?.trim() ||
    '';

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
      <Text style={styles.helper}>{phoneLabel}</Text>

      <View style={styles.divider} />

      <Text style={[styles.label, { marginBottom: 12 }]}>{t('home.dashboard')}</Text>

      <TouchableOpacity style={styles.card} onPress={onGoNewConsult} disabled={busy} activeOpacity={0.85}>
        <Text style={styles.value}>{t('home.startConsultation')}</Text>
        <Text style={[styles.helper, { marginBottom: 0 }]}>{t('home.startConsultationBody')}</Text>
      </TouchableOpacity>

      <View style={styles.mt16} />

      <TouchableOpacity style={styles.card} onPress={onGoRecords} disabled={busy} activeOpacity={0.85}>
        <Text style={styles.value}>{t('home.pastConsultations')}</Text>
        <Text style={[styles.helper, { marginBottom: 0 }]}>{t('home.pastConsultationsBody')}</Text>
      </TouchableOpacity>

      <View style={styles.mt16} />

      <TouchableOpacity style={styles.card} onPress={onGoProfile} disabled={busy} activeOpacity={0.85}>
        <Text style={styles.value}>{t('home.profileTab')}</Text>
        <Text style={[styles.helper, { marginBottom: 0 }]}>{t('home.profileBody')}</Text>
      </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}