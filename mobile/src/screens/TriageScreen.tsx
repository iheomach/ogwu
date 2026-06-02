import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import type { TriageScreenProps } from '../types';
import { colors, styles, spacing } from '../ui/styles';
import { t } from '../i18n';

export function TriageScreen({
  busy,
  question,
  questionIndex,
  answer,
  setAnswer,
  onBack,
  onNext,
  suggestions = [],
}: TriageScreenProps) {
  const [focused, setFocused] = useState(false);
  const isQ2 = questionIndex === 1;
  const canContinue = !busy && (isQ2 ? true : answer.trim().length > 0);

  const [sliderValue, setSliderValue] = useState(() => {
    if (questionIndex === 1 && answer) {
      const parsed = parseInt(answer, 10);
      return !isNaN(parsed) ? parsed : 5;
    }
    return 5;
  });

  // Keep answer in sync with slider for Q2
  const onSliderChange = (val: number) => {
    const rounded = Math.round(val);
    setSliderValue(rounded);
    setAnswer(String(rounded));
  };

  // Set default slider value when arriving at Q2 with no prior answer
  useEffect(() => {
    if (isQ2 && !answer) {
      setSliderValue(5);
      setAnswer('5');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

          {/* Quick reply chips — hidden on Q2 and while loading */}
          {!busy && !isQ2 && suggestions.length > 0 && (
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

          {/* Q2: severity slider */}
          {isQ2 ? (
            <View style={{ marginTop: 16, marginBottom: 8 }}>
              <Text style={{
                textAlign: 'center',
                fontSize: 48,
                fontWeight: '700',
                color: colors.white,
                marginBottom: 4,
              }}>
                {sliderValue}
              </Text>
              <Text style={{ textAlign: 'center', fontSize: 12, color: colors.grey500, marginBottom: 20 }}>
                {sliderValue === 0 ? 'No pain' : sliderValue <= 3 ? 'Mild' : sliderValue <= 6 ? 'Moderate' : sliderValue <= 8 ? 'Severe' : 'Extreme'}
              </Text>
              <Slider
                minimumValue={0}
                maximumValue={10}
                step={1}
                value={sliderValue}
                onValueChange={onSliderChange}
                minimumTrackTintColor={colors.purple}
                maximumTrackTintColor="rgba(255,255,255,0.15)"
                thumbTintColor={colors.purple}
                style={{ width: '100%', height: 40 }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ fontSize: 11, color: colors.grey500 }}>0</Text>
                <Text style={{ fontSize: 11, color: colors.grey500 }}>10</Text>
              </View>
            </View>
          ) : (
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
          )}

          <TouchableOpacity
            style={[styles.btnPrimary, (!canContinue || busy) && styles.btnPrimaryDisabled, { marginTop: isQ2 ? 24 : 0 }]}
            onPress={onNext}
            disabled={!canContinue || busy}
            activeOpacity={0.85}
          >
            <Text style={styles.btnPrimaryText}>
              {busy ? t('triage.loading') : t('triage.next')}
            </Text>
          </TouchableOpacity>

          {questionIndex > 0 && (
            <TouchableOpacity
              onPress={onBack}
              disabled={busy}
              activeOpacity={0.7}
              style={{ marginTop: 12, alignItems: 'center', paddingVertical: 10 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialIcons name="arrow-back-ios" size={13} color={colors.purpleGlow} />
                <Text style={{ fontSize: 14, color: colors.purpleGlow }}>Previous question</Text>
              </View>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
