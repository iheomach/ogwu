import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { OnboardingScreenProps } from '../types';
import { colors, glassSurface, spacing, styles } from '../ui/styles';
import { t } from '../i18n';

function TagInput({
  value,
  onChange,
  placeholder,
  editable = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  editable?: boolean;
}) {
  const [draft, setDraft] = useState('');

  const tags = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const addTag = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const next = [...tags, trimmed].join(', ');
    onChange(next);
    setDraft('');
  };

  const removeTag = (i: number) => {
    const next = tags.filter((_, idx) => idx !== i).join(', ');
    onChange(next);
  };

  return (
    <View>
      {tags.length > 0 && (
        <View style={styles.tagInputWrap}>
          {tags.map((tag, i) => (
            <View key={i} style={styles.tagChip}>
              <Text style={styles.tagChipText}>{tag}</Text>
              {editable && (
                <TouchableOpacity onPress={() => removeTag(i)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={{ fontSize: 13, color: colors.grey300, lineHeight: 16 }}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}
      {editable && (
        <View style={styles.tagAddRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            placeholderTextColor={colors.grey300}
            style={styles.tagAddInput}
            onSubmitEditing={addTag}
            returnKeyType="done"
            blurOnSubmit={false}
          />
          <TouchableOpacity style={styles.tagAddBtn} onPress={addTag}>
            <Text style={styles.tagAddBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text style={styles.inputLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function OnboardingScreen({
  busy,
  firstName,
  setFirstName,
  middleName,
  setMiddleName,
  lastName,
  setLastName,
  dob,
  setDob,
  biologicalSex,
  setBiologicalSex,
  allergies,
  setAllergies,
  knownConditions,
  setKnownConditions,
  onContinue,
}: OnboardingScreenProps) {
  const [focused, setFocused] = useState<string | null>(null);

  const inputStyle = (name: string) => [
    styles.input,
    focused === name && styles.inputFocused,
  ];

  const canContinue =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    dob.trim().length === 10 &&
    biologicalSex.trim().length > 0;

  const formatDobInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    const mm = digits.slice(0, 2);
    const dd = digits.slice(2, 4);
    const yyyy = digits.slice(4, 8);
    if (digits.length <= 2) return mm;
    if (digits.length <= 4) return `${mm}/${dd}`;
    return `${mm}/${dd}/${yyyy}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Heading */}
        <Text style={styles.title}>{t('onboarding.title')}</Text>
        <Text style={styles.helper}>{t('onboarding.helper')}</Text>

        {/* Progress pill */}
        <View style={[styles.pill, { marginBottom: 24 }]}>
          <Text style={styles.pillText}>{t('onboarding.step')}</Text>
        </View>

        {/* Fields */}
        <Field label={t('onboarding.firstName')}>
          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First"
            placeholderTextColor={colors.grey300}
            autoCapitalize="words"
            style={inputStyle('firstName')}
            editable={!busy}
            onFocus={() => setFocused('firstName')}
            onBlur={() => setFocused(null)}
          />
        </Field>

        <Field label={t('onboarding.middleName')}>
          <TextInput
            value={middleName}
            onChangeText={setMiddleName}
            placeholder="Middle"
            placeholderTextColor={colors.grey300}
            autoCapitalize="words"
            style={inputStyle('middleName')}
            editable={!busy}
            onFocus={() => setFocused('middleName')}
            onBlur={() => setFocused(null)}
          />
        </Field>

        <Field label={t('onboarding.lastName')}>
          <TextInput
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last"
            placeholderTextColor={colors.grey300}
            autoCapitalize="words"
            style={inputStyle('lastName')}
            editable={!busy}
            onFocus={() => setFocused('lastName')}
            onBlur={() => setFocused(null)}
          />
        </Field>

        <Field label={t('onboarding.dob')}>
          <TextInput
            value={dob}
            onChangeText={(v) => setDob(formatDobInput(v))}
            placeholder="06/24/1998"
            placeholderTextColor={colors.grey300}
            keyboardType="number-pad"
            style={inputStyle('dob')}
            editable={!busy}
            onFocus={() => setFocused('dob')}
            onBlur={() => setFocused(null)}
            maxLength={10}
          />
        </Field>

        <Field label={t('onboarding.sex')}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.md }}>
            {([
              { value: 'Male',   label: t('onboarding.male') },
              { value: 'Female', label: t('onboarding.female') },
              { value: 'Other',  label: t('onboarding.other') },
            ] as const).map(({ value, label }) => {
              const selected = biologicalSex === value;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => !busy && setBiologicalSex(value)}
                  activeOpacity={0.8}
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: selected ? colors.purple : glassSurface.borderSoft,
                    backgroundColor: selected ? 'rgba(123,77,217,0.18)' : glassSurface.bg,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: selected ? colors.purpleGlow : colors.grey500,
                  }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        <Field label={t('onboarding.allergies')}>
          <TagInput
            value={allergies}
            onChange={setAllergies}
            placeholder={t('onboarding.allergiesPlaceholder')}
            editable={!busy}
          />
        </Field>

        <View style={{ height: spacing.md }} />

        <Field label={t('onboarding.conditions')}>
          <TagInput
            value={knownConditions}
            onChange={setKnownConditions}
            placeholder={t('onboarding.conditionsPlaceholder')}
            editable={!busy}
          />
        </Field>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.btnPrimary, (!canContinue || busy) && styles.btnPrimaryDisabled]}
          onPress={onContinue}
          disabled={!canContinue || busy}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>
            {busy ? t('common.saving') : t('common.continue')}
          </Text>
        </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}