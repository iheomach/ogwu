import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import type { ProfileScreenProps } from '../types';
import { colors, styles, spacing, TAB_BAR_HEIGHT } from '../ui/styles';
import { GlassCard } from '../ui/GlassCard';
import { languageLabels, t } from '../i18n';
import { SUPPORTED_LOCALES, type SupportedLocale } from '../i18n/translations';

function parseTags(raw: string | null | undefined): string[] {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function TagInput({
  tags,
  onChange,
  placeholder,
  disabled,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState('');

  function addTag() {
    const val = draft.trim();
    if (!val) return;
    if (!tags.map((t) => t.toLowerCase()).includes(val.toLowerCase())) {
      onChange([...tags, val]);
    }
    setDraft('');
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, i) => i !== index));
  }

  return (
    <View>
      {tags.length > 0 && (
        <View style={styles.tagInputWrap}>
          {tags.map((tag, i) => (
            <View key={i} style={styles.tagChip}>
              <Text style={styles.tagChipText}>{tag}</Text>
              {!disabled && (
                <TouchableOpacity onPress={() => removeTag(i)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <MaterialIcons name="close" size={13} color={colors.purple} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}
      {!disabled && (
        <View style={styles.tagAddRow}>
          <TextInput
            style={styles.tagAddInput}
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            placeholderTextColor={colors.grey300}
            onSubmitEditing={addTag}
            returnKeyType="done"
            blurOnSubmit={false}
          />
          <TouchableOpacity style={styles.tagAddBtn} onPress={addTag} activeOpacity={0.8}>
            <Text style={styles.tagAddBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

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
  const [allergyTags, setAllergyTags] = useState<string[]>(() => parseTags(profile?.allergies));
  const [conditionTags, setConditionTags] = useState<string[]>(() => parseTags(profile?.known_conditions));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile && !saving) {
      setAllergyTags(parseTags(profile.allergies));
      setConditionTags(parseTags(profile.known_conditions));
    }
  }, [profile?.allergies, profile?.known_conditions]);

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
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { justifyContent: 'flex-start', paddingBottom: TAB_BAR_HEIGHT }]}>
        <Text style={styles.title}>{t('profile.title')}</Text>
        <Text style={styles.helper}>{phoneLabel}</Text>

        <Text style={[styles.label, { marginBottom: 12 }]}>{t('profile.details')}</Text>
        <GlassCard innerStyle={{ padding: spacing.lg }}>
          <ProfileRow label={t('home.fullName')} value={displayFullName || null} />
          <ProfileRow label={t('home.dob')} value={profile?.dob} />
          <ProfileRow label={t('home.sex')} value={profile?.biological_sex} />

          {/* Editable: allergies */}
          <View style={styles.profileField}>
            <Text style={styles.label}>{t('home.allergies')}</Text>
            <TagInput
              tags={allergyTags}
              onChange={setAllergyTags}
              placeholder="e.g. Penicillin"
              disabled={busy || saving}
            />
          </View>

          {/* Editable: conditions */}
          <View style={[styles.profileField, styles.profileFieldLast]}>
            <Text style={styles.label}>{t('home.conditions')}</Text>
            <TagInput
              tags={conditionTags}
              onChange={setConditionTags}
              placeholder="e.g. Hypertension"
              disabled={busy || saving}
            />
          </View>
        </GlassCard>

        <TouchableOpacity
          style={[styles.btnPrimary, (busy || saving) && styles.btnPrimaryDisabled, { marginBottom: 24 }]}
          onPress={async () => {
            setSaving(true);
            try {
              await onSaveProfile(allergyTags.join(', '), conditionTags.join(', '));
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
        <GlassCard innerStyle={{ padding: spacing.lg }}>
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
        </GlassCard>

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
