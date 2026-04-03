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

import type { TriageScreenProps } from '../types';
import { colors, styles } from '../ui/styles';
import { t } from '../i18n';

export function TriageScreen({
  busy,
  step,
  total,
  question,
  answer,
  setAnswer,
  onNext,
}: TriageScreenProps) {
  const [focused, setFocused] = useState(false);
  const canContinue = answer.trim().length > 0 && !busy;

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

          <Text style={styles.title}>{t('triage.title')}</Text>
          <Text style={styles.helper}>{t('triage.helper')}</Text>

          <View style={[styles.pill, { marginBottom: 24 }]}> 
            <Text style={styles.pillText}>{t('triage.progress', { step, total })}</Text>
          </View>

          <Text style={styles.inputLabel}>{question}</Text>
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
