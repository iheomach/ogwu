import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
  onLogout,
}: ProfileScreenProps) {
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageMenuVisible, setLanguageMenuVisible] = useState(false);

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
      </ScrollView>
    </SafeAreaView>
  );
}
