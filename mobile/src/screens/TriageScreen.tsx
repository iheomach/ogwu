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
}: TriageScreenProps) {
  const [focused, setFocused] = useState(false);
  const canContinue = answer.trim().length > 0 && !busy;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg }}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <TouchableOpacity style={styles.btnGhost} onPress={onBack} disabled={busy}>
            <Text style={styles.btnGhostText}>{t('common.back')}</Text>
          </TouchableOpacity>

          <View style={styles.brandRow}>
            <Image source={require('../../assets/ogwu-mark.png')} style={{ width: 40, height: 40 }} resizeMode="contain" />
          </View>

          <Text style={styles.title}>{t('triage.title')}</Text>
          <Text style={styles.helper}>{t('triage.helper')}</Text>

          <Text style={[styles.inputLabel, { marginTop: 28 }]}>{question}</Text>
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
