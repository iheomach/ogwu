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

import type { PhoneScreenProps } from '../types';
import { colors, styles } from '../ui/styles';
import { t } from '../i18n';

export function PhoneScreen({ busy, phone, setPhone, onSendOtp }: PhoneScreenProps) {
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
        <Text style={styles.title}>{t('phone.title')}</Text>
        <Text style={styles.helper}>{t('phone.helper')}</Text>

        {/* Input */}
        <Text style={styles.inputLabel}>{t('phone.label')}</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder={t('phone.placeholder')}
          placeholderTextColor={colors.grey300}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="phone-pad"
          style={[styles.input, focused && styles.inputFocused]}
          editable={!busy}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />

        {/* CTA */}
        <TouchableOpacity
          style={[styles.btnPrimary, busy && styles.btnPrimaryDisabled]}
          onPress={onSendOtp}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>
            {busy ? t('phone.sending') : t('phone.sendCode')}
          </Text>
        </TouchableOpacity>

        {/* Fine print */}
        <Text style={[styles.helper, { textAlign: 'center', marginTop: 24, fontSize: 12 }]}>
          {t('phone.finePrint')}
        </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}