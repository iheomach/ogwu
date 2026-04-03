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

import type { OtpScreenProps } from '../types';
import { colors, styles } from '../ui/styles';
import { t } from '../i18n';

export function OtpScreen({ busy, phoneLabel, otp, setOtp, onBack, onVerify }: OtpScreenProps) {
  const [focused, setFocused] = useState(false);

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
        <Text style={styles.title}>{t('otp.title')}</Text>
        <Text style={styles.helper}>
          {t('otp.helperPrefix')}{' '}
          <Text style={{ color: colors.purple, fontWeight: '600' }}>{phoneLabel}</Text>
        </Text>

        {/* OTP Input */}
        <Text style={styles.inputLabel}>{t('otp.label')}</Text>
        <TextInput
          value={otp}
          onChangeText={setOtp}
          placeholder={t('otp.placeholder')}
          placeholderTextColor={colors.grey300}
          keyboardType="number-pad"
          maxLength={6}
          style={[
            styles.input,
            focused && styles.inputFocused,
            { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
          ]}
          editable={!busy}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />

        {/* Verify CTA */}
        <TouchableOpacity
          style={[styles.btnPrimary, (busy || otp.length < 6) && styles.btnPrimaryDisabled]}
          onPress={onVerify}
          disabled={busy || otp.length < 6}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>
            {busy ? t('otp.verifying') : t('otp.verify')}
          </Text>
        </TouchableOpacity>

        {/* Back */}
        <TouchableOpacity style={styles.btnGhost} onPress={onBack} disabled={busy}>
          <Text style={styles.btnGhostText}>{t('common.backDifferentNumber')}</Text>
        </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}