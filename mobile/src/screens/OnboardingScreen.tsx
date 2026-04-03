import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';

import type { OnboardingScreenProps } from '../types';
import { colors, styles } from '../ui/styles';
import { t } from '../i18n';

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
        {/* Brand */}
        <View style={styles.brandRow}>
          <View style={styles.brandDot} />
          <Text style={styles.brandName}>{t('common.appName')}</Text>
        </View>

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
            placeholder="Ada"
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
            placeholder="Chinenye"
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
            placeholder="Obi"
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
          <View style={[styles.pickerContainer, focused === 'sex' && styles.inputFocused]}>
            <Picker
              selectedValue={biologicalSex}
              onValueChange={(v) => setBiologicalSex(String(v))}
              enabled={!busy}
              style={styles.picker}
              onFocus={() => setFocused('sex')}
              onBlur={() => setFocused(null)}
            >
              <Picker.Item label={t('common.select')} value="" color={colors.grey500 as any} />
              <Picker.Item label={t('onboarding.female')} value="Female" />
              <Picker.Item label={t('onboarding.male')} value="Male" />
              <Picker.Item label={t('onboarding.preferNotToSay')} value="prefer_not_to_say" />
            </Picker>
          </View>
        </Field>

        <Field label={t('onboarding.allergies')}>
          <TextInput
            value={allergies}
            onChangeText={setAllergies}
            placeholder={t('onboarding.allergiesPlaceholder')}
            placeholderTextColor={colors.grey300}
            multiline
            style={[inputStyle('allergies'), styles.textArea]}
            editable={!busy}
            onFocus={() => setFocused('allergies')}
            onBlur={() => setFocused(null)}
          />
        </Field>

        <Field label={t('onboarding.conditions')}>
          <TextInput
            value={knownConditions}
            onChangeText={setKnownConditions}
            placeholder={t('onboarding.conditionsPlaceholder')}
            placeholderTextColor={colors.grey300}
            multiline
            style={[inputStyle('conditions'), styles.textArea]}
            editable={!busy}
            onFocus={() => setFocused('conditions')}
            onBlur={() => setFocused(null)}
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