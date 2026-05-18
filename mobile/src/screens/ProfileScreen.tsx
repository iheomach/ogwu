import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import type { ProfileScreenProps } from '../types';
import { colors, styles } from '../ui/styles';
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
  onSaveProfile,
  onLogout,
  onDeleteAccount,
}: ProfileScreenProps) {
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageMenuVisible, setLanguageMenuVisible] = useState(false);
  const [allergies, setAllergies] = useState(profile?.allergies ?? '');
  const [conditions, setConditions] = useState(profile?.known_conditions ?? '');
  const [saving, setSaving] = useState(false);

  const menuAnim = useRef(new Animated.Value(0)).current;
  const menuMaxHeight = useMemo(() => SUPPORTED_LOCALES.length * 48, []);

  useEffect(() => {
    if (languageOpen) {
      setLanguageMenuVisible(true);
      menuAnim.stopAnimation();
      Animated.timing(menuAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: false,
      }).start();
    } else {
      menuAnim.stopAnimation();
      Animated.timing(menuAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) setLanguageMenuVisible(false);
      });
    }
  }, [languageOpen, menuAnim]);
  const displayFullName = [profile?.first_name, profile?.middle_name, profile?.last_name]
    .filter((p) => (p ?? '').trim().length > 0)
    .join(' ');

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { justifyContent: 'flex-start' }]}>
        <Text style={styles.title}>{t('profile.title')}</Text>
        <Text style={styles.helper}>{phoneLabel}</Text>

        <Text style={[styles.label, { marginBottom: 12 }]}>{t('profile.details')}</Text>
        <View style={styles.card}>
          <ProfileRow label={t('home.fullName')} value={displayFullName || null} />
          <ProfileRow label={t('home.dob')} value={profile?.dob} />
          <ProfileRow label={t('home.sex')} value={profile?.biological_sex} />

          {/* Editable: allergies */}
          <View style={[styles.profileField]}>
            <Text style={styles.label}>{t('home.allergies')}</Text>
            <TextInput
              value={allergies}
              onChangeText={setAllergies}
              placeholder="e.g. Penicillin, peanuts"
              placeholderTextColor={colors.grey300}
              style={styles.profileEditInput}
              editable={!busy && !saving}
              multiline
            />
          </View>

          {/* Editable: conditions */}
          <View style={[styles.profileField, styles.profileFieldLast]}>
            <Text style={styles.label}>{t('home.conditions')}</Text>
            <TextInput
              value={conditions}
              onChangeText={setConditions}
              placeholder="e.g. Hypertension, diabetes"
              placeholderTextColor={colors.grey300}
              style={styles.profileEditInput}
              editable={!busy && !saving}
              multiline
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.btnPrimary, (busy || saving) && styles.btnPrimaryDisabled, { marginBottom: 24 }]}
          onPress={async () => {
            setSaving(true);
            try {
              await onSaveProfile(allergies.trim(), conditions.trim());
            } finally {
              setSaving(false);
            }
          }}
          disabled={busy || saving}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>{saving ? 'Saving…' : 'Save changes'}</Text>
        </TouchableOpacity>

        <Text style={[styles.label, { marginBottom: 12 }]}>{t('home.language')}</Text>
        <View style={styles.dropdownContainer}>
          <TouchableOpacity
            style={styles.dropdownButton}
            onPress={() => setLanguageOpen((v) => !v)}
            disabled={busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('home.language')}
          >
            <Text style={styles.dropdownButtonText}>{languageLabels[locale]}</Text>
            <MaterialIcons
              name={languageOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
              size={20}
              color={colors.grey700}
            />
          </TouchableOpacity>

          {languageMenuVisible && (
            <Animated.View
              style={[
                styles.dropdownMenu,
                {
                  height: menuAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, menuMaxHeight],
                  }),
                  opacity: menuAnim,
                },
              ]}
            >
              {SUPPORTED_LOCALES.map((code) => {
                const active = code === locale;
                return (
                  <TouchableOpacity
                    key={code}
                    style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                    onPress={() => {
                      onChangeLocale(code as SupportedLocale);
                      setLanguageOpen(false);
                    }}
                    disabled={busy}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>
                      {languageLabels[code]}
                    </Text>
                    {active && <MaterialIcons name="check" size={18} color={colors.purple} />}
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          )}
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

        <TouchableOpacity
          style={[styles.btnDestructive, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.error, marginTop: 8 }]}
          onPress={() => {
            Alert.alert(
              'Delete Account',
              'This will permanently delete your account and all health data. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => onDeleteAccount(),
                },
              ],
            );
          }}
          disabled={busy}
          activeOpacity={0.8}
        >
          <Text style={[styles.btnDestructiveText, { color: colors.error }]}>Delete Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
