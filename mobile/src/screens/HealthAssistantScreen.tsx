import { useMemo } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useChat } from '@ai-sdk/react';
import { fetch as expoFetch } from 'expo/fetch';

import { supabase } from '../../lib/supabase';
import type { ScreenPropsBase } from '../types';
import { colors, radius, spacing, styles } from '../ui/styles';
import { t } from '../i18n';

async function authedFetch(input: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const headers = new Headers(init?.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return expoFetch(input, {
    ...init,
    headers,
  } as any);
}

function messageText(m: any): string {
  // Vercel AI messages can be string content or structured parts depending on version.
  const c = (m as any)?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .join('')
      .trim();
  }
  return '';
}

export function HealthAssistantScreen({ busy }: ScreenPropsBase) {
  const apiUrl = useMemo(() => {
    const base = process.env.EXPO_PUBLIC_API_URL;
    if (!base) return null;
    return `${base.replace(/\/$/, '')}/api/agent/chat`;
  }, []);

  const {
    messages,
    input,
    handleSubmit,
    isLoading,
    error,
    setInput,
  } = useChat({
    api: apiUrl || '/api/agent/chat',
    fetch: authedFetch as any,
    streamProtocol: 'text', // Backend uses toTextStreamResponse() which sends plain text deltas
  });

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <View
          style={[
            styles.content,
            { flex: 1, justifyContent: 'flex-start', opacity: busy ? 0.7 : 1 },
          ]}
        >
          <View style={[styles.card, { marginBottom: 12 }]}>
            <Text style={styles.value}>{t('assistant.title')}</Text>
            <Text style={[styles.helper, { marginBottom: 0 }]}>{t('assistant.helper')}</Text>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
            {messages.map((m: any, idx: number) => {
              const role = (m as any)?.role;
              const text = messageText(m);
              if (!text) return null;

              const isUser = role === 'user';
              return (
                <View
                  key={(m as any)?.id || `${role}-${idx}`}
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    backgroundColor: isUser ? colors.purple : colors.grey100,
                    padding: spacing.md,
                    borderRadius: radius.md,
                    marginBottom: spacing.sm,
                    maxWidth: '92%',
                  }}
                >
                  <Text style={{ color: isUser ? colors.white : colors.grey900, lineHeight: 20 }}>{text}</Text>
                </View>
              );
            })}

            {isLoading && (
              <View style={{ paddingVertical: 6 }}>
                <ActivityIndicator color={colors.purple} />
              </View>
            )}

            {!!error && (
              <View style={[styles.card, { backgroundColor: colors.errorLight }]}>
                <Text style={[styles.helper, { marginBottom: 0, color: colors.error }]}>
                  {String((error as any)?.message || error)}
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <TextInput
                value={input}
                onChangeText={(text) => setInput(text)}
                placeholder={t('assistant.placeholder')}
                placeholderTextColor={colors.grey500}
                style={[styles.input, { minHeight: 44, maxHeight: 120 }]}
                multiline
              />
            </View>
            <TouchableOpacity
              style={[
                styles.btnPrimary,
                { paddingHorizontal: 16, paddingVertical: 12, marginTop: 0 },
                (busy || isLoading || !apiUrl) && styles.btnPrimaryDisabled,
              ]}
              onPress={() => handleSubmit()}
              disabled={busy || isLoading || !apiUrl}
              accessibilityRole="button"
              activeOpacity={0.85}
            >
              <Text style={styles.btnPrimaryText}>{isLoading ? t('assistant.thinking') : t('assistant.send')}</Text>
            </TouchableOpacity>
          </View>

          {!apiUrl && (
            <Text style={[styles.helper, { marginTop: 10 }]}>
              Missing EXPO_PUBLIC_API_URL
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
