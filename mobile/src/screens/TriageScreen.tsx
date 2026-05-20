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
import { MaterialIcons } from '@expo/vector-icons';

import type { TriageScreenProps } from '../types';
import { colors, styles, spacing } from '../ui/styles';
import { t } from '../i18n';

export function TriageScreen({
  busy,
  question,
  answer,
  setAnswer,
  onBack,
  onNext,
  suggestions = [],
}: TriageScreenProps) {
  const [focused, setFocused] = useState(false);
  const canContinue = answer.trim().length > 0 && !busy;

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity
        onPress={onBack}
        disabled={busy}
        activeOpacity={0.7}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}
      >
        <MaterialIcons name="arrow-back-ios" size={16} color={colors.purpleGlow} />
      </TouchableOpacity>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg }}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <Text style={styles.title}>{t('triage.title')}</Text>
          <Text style={styles.helper}>{t('triage.helper')}</Text>

          <Text style={[styles.inputLabel, { marginTop: 28 }]}>{question}</Text>

          {/* Quick reply chips */}
          {!busy && suggestions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 8, paddingVertical: 10 }}
            >
              {suggestions.map((chip) => {
                const selected = answer === chip;
                return (
                  <TouchableOpacity
                    key={chip}
                    onPress={() => setAnswer(selected ? '' : chip)}
                    activeOpacity={0.75}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: selected ? colors.purple : 'rgba(255,255,255,0.25)',
                      backgroundColor: selected ? colors.purple : 'rgba(255,255,255,0.07)',
                    }}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontWeight: '500',
                      color: selected ? colors.white : colors.grey700,
                    }}>
                      {chip}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <TextInput
            value={answer}
            onChangeText={setAnswer}
            placeholder={t('triage.placeholder')}
            placeholderTextColor={colors.grey300}
            multiline
            style={[styles.input, focused && styles.inputFocused, styles.textArea]}
            editable={!busy}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          <TouchableOpacity
            style={[styles.btnPrimary, (!canContinue || busy) && styles.btnPrimaryDisabled]}
            onPress={onNext}
            disabled={!canContinue || busy}
            activeOpacity={0.85}
          >
            <Text style={styles.btnPrimaryText}>
              {busy ? t('triage.loading') : t('triage.next')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
