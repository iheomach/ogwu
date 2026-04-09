import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

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

function renderToolInvocation(part: any): ReactNode {
  if (!part || !part.type?.startsWith('tool-')) return null;

  const toolName = part.type.replace('tool-', '');
  const state = part.state;
  const errorText = part.errorText;

  let statusText = '';
  let statusColor = colors.grey500;

  if (state === 'input-streaming') {
    statusText = `🔄 ${toolName}: gathering input...`;
    statusColor = colors.purple;
  } else if (state === 'input-available') {
    statusText = `⚙️ ${toolName}: processing...`;
    statusColor = colors.purple;
  } else if (state === 'output-available') {
    statusText = `✓ ${toolName}: found results`;
    statusColor = '#10b981';
  } else if (state === 'output-error') {
    statusText = `✗ ${toolName}: ${errorText || 'error'}`;
    statusColor = colors.error;
  }

  return statusText ? (
    <View key={`tool-${part.toolCallId}`} style={{ marginBottom: spacing.sm }}>
      <Text style={{ color: statusColor, fontSize: 12, fontStyle: 'italic' }}>{statusText}</Text>
    </View>
  ) : null;
}

// Glass bubble for assistant messages
const glassBubbleStyle = {
  alignSelf: 'flex-start' as const,
  backgroundColor: 'rgba(69, 0, 80, 0.06)',
  borderWidth: 1,
  borderColor: 'rgba(69, 0, 80, 0.12)',
  padding: spacing.md,
  borderRadius: 18,
  marginBottom: spacing.sm,
  maxWidth: '88%' as const,
  shadowColor: colors.purple,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
};

// Solid bubble for user messages
const userBubbleStyle = {
  alignSelf: 'flex-end' as const,
  backgroundColor: colors.purple,
  padding: spacing.md,
  borderRadius: 18,
  marginBottom: spacing.sm,
  maxWidth: '88%' as const,
  shadowColor: colors.purple,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 10,
  elevation: 4,
};

const TOOL_LABELS: Record<string, string> = {
  searchHospitals: 'Searching hospitals near you...',
  getHospitalBookingInfo: 'Checking booking options...',
  bookAppointment: 'Booking your appointment...',
  createConsult: 'Saving your record...',
  flagEmergency: 'Flagging emergency...',
  getPatientHistory: 'Reviewing your history...',
  checkDrugInteraction: 'Checking medication safety...',
};

export function HealthAssistantScreen({ busy, location }: ScreenPropsBase) {
  const [isInitialized, setIsInitialized] = useState(false);

  const apiUrl = useMemo(() => {
    const base = process.env.EXPO_PUBLIC_API_URL;
    if (!base) return null;
    return `${base.replace(/\/$/, '')}/api/agent/chat`;
  }, []);

  const {
    messages,
    input,
    handleSubmit,
    status,
    error,
    setInput,
    setMessages,
  } = useChat({
    api: apiUrl || '/api/agent/chat',
    fetch: authedFetch as any,
    streamProtocol: 'data',
    body: location ? { location } : undefined,
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // Derive a short label from whichever tool is currently active.
  const thinkingLabel = useMemo(() => {
    if (!isLoading) return null;
    const lastAssistant = [...messages].reverse().find((m: any) => m.role === 'assistant');
    const parts: any[] = (lastAssistant as any)?.parts || [];
    const active = parts
      .filter((p: any) =>
        p.type?.startsWith('tool-') &&
        (p.state === 'input-streaming' || p.state === 'input-available')
      )
      .at(-1);
    if (!active) return 'Thinking...';
    const toolName = active.type?.replace('tool-', '') ?? '';
    return TOOL_LABELS[toolName] ?? 'Working on it...';
  }, [isLoading, messages]);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('assistantMessages');
        if (saved) setMessages(JSON.parse(saved));
      } catch (err) {
        console.error('Failed to restore assistant messages:', err);
      } finally {
        setIsInitialized(true);
      }
    })();
  }, [setMessages]);

  useEffect(() => {
    if (!isInitialized) return;
    (async () => {
      try {
        await AsyncStorage.setItem('assistantMessages', JSON.stringify(messages));
      } catch (err) {
        console.error('Failed to save assistant messages:', err);
      }
    })();
  }, [messages, isInitialized]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#FAF7FB' }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <View style={{ flex: 1, opacity: busy ? 0.7 : 1 }}>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 80 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Greeting bubble */}
            <View style={glassBubbleStyle}>
              <Text style={{ color: colors.purple, fontWeight: '700', fontSize: 14, marginBottom: 4 }}>
                {t('assistant.title')}
              </Text>
              <Text style={{ color: colors.grey700, lineHeight: 20, fontSize: 14 }}>
                {t('assistant.helper')}
              </Text>
            </View>

            {messages.map((m: any, idx: number) => {
              const role = (m as any)?.role;
              const text = messageText(m);
              const parts = (m as any)?.parts || [];
              const toolParts = parts.filter((p: any) => p.type?.startsWith('tool-'));

              return (
                <View key={(m as any)?.id || `${role}-${idx}`}>
                  {text && (
                    <View style={role === 'user' ? userBubbleStyle : glassBubbleStyle}>
                      <Text style={{
                        color: role === 'user' ? colors.white : colors.grey900,
                        lineHeight: 20,
                        fontSize: 15,
                      }}>
                        {text}
                      </Text>
                    </View>
                  )}
                  {toolParts.map((part: any) => renderToolInvocation(part))}
                </View>
              );
            })}

            {isLoading && thinkingLabel && (
              <View style={[glassBubbleStyle, { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }]}>
                <ActivityIndicator color={colors.purple} size="small" />
                <Text style={{ color: colors.grey500, fontSize: 13, fontStyle: 'italic' }}>
                  {thinkingLabel}
                </Text>
              </View>
            )}

            {!!error && (
              <View style={[glassBubbleStyle, { backgroundColor: 'rgba(239, 68, 68, 0.06)', borderColor: 'rgba(239, 68, 68, 0.2)' }]}>
                <Text style={{ color: colors.error, fontSize: 14, lineHeight: 20 }}>
                  {String((error as any)?.message || error)}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Conjoined floating input bar */}
          <View style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
          }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              backgroundColor: 'rgba(255, 255, 255, 0.82)',
              borderRadius: radius.full,
              overflow: 'hidden',
              shadowColor: colors.purple,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.1,
              shadowRadius: 16,
              elevation: 4,
            }}>
              <TextInput
                value={input}
                onChangeText={(text) => setInput(text)}
                placeholder={t('assistant.placeholder')}
                placeholderTextColor="rgba(107, 114, 128, 0.65)"
                style={{
                  flex: 1,
                  minHeight: 48,
                  maxHeight: 120,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: colors.grey900,
                  backgroundColor: 'transparent',
                }}
                multiline
              />
              <TouchableOpacity
                style={{
                  width: 52,
                  alignSelf: 'stretch',
                  backgroundColor: (busy || isLoading || !apiUrl)
                    ? 'rgba(69, 0, 80, 0.35)'
                    : 'rgba(69, 0, 80, 0.6)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => handleSubmit()}
                disabled={busy || isLoading || !apiUrl}
                accessibilityRole="button"
                activeOpacity={0.8}
              >
                {isLoading
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <MaterialIcons name="arrow-forward" size={22} color={colors.white} />
                }
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
