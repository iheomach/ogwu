import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ConsultMessage, ConsultThread, ScreenPropsBase } from '../types';
import { styles, colors } from '../ui/styles';
import { t } from '../i18n';
import { threadMessageSend, threadMessagesList, threadsList } from '../lib/threads';

export type ThreadScreenProps = ScreenPropsBase & {
  threadId: string;
  onBack: () => void;
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
  } catch {
    return '';
  }
}

export function ThreadScreen({ busy, threadId, onBack }: ThreadScreenProps) {
  const [loading, setLoading] = useState(true);
  const [thread, setThread] = useState<ConsultThread | null>(null);
  const [messages, setMessages] = useState<ConsultMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  const title = useMemo(() => {
    if (thread?.provider_type === 'external') return t('thread.externalTitle');
    if (thread?.doctor?.name) return thread.doctor.name;
    return t('thread.title');
  }, [thread?.provider_type, thread?.doctor?.name]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);

        // Load thread metadata (via list endpoint, to keep API surface minimal)
        const listRes = await threadsList();
        const found = Array.isArray(listRes?.threads)
          ? listRes.threads.find((x) => x && x.id === threadId) ?? null
          : null;
        if (!mounted) return;
        setThread(found);

        const msgRes = await threadMessagesList(threadId);
        if (!mounted) return;
        setMessages(Array.isArray(msgRes?.messages) ? msgRes.messages : []);
      } catch (e: any) {
        if (!mounted) return;
        Alert.alert(t('common.error'), e?.message ?? t('common.error'));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [threadId]);

  const onSend = async () => {
    const body = draft.trim();
    if (!body) return;

    try {
      setDraft('');
      const res = await threadMessageSend(threadId, { body });
      const msg = res?.message;
      if (msg) setMessages((prev) => [...prev, msg]);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? t('common.error'));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { justifyContent: 'flex-start', opacity: busy ? 0.7 : 1 }]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity style={styles.btnGhost} onPress={onBack} disabled={busy}>
            <Text style={styles.btnGhostText}>{t('common.back')}</Text>
          </TouchableOpacity>

          <View style={[styles.brandRow, { marginBottom: 16 }]}>
            <View style={styles.brandDot} />
            <Text style={styles.brandName}>{t('common.appName')}</Text>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.helper}>{t('thread.helper')}</Text>

          {loading && (
            <View style={[styles.center, { paddingHorizontal: 0, paddingVertical: 24 }]}>
              <ActivityIndicator color={colors.purple} />
            </View>
          )}

          {!loading && messages.length === 0 && (
            <View style={styles.card}>
              <Text style={styles.value}>{t('thread.emptyTitle')}</Text>
              <Text style={[styles.helper, { marginBottom: 0 }]}>{t('thread.emptyBody')}</Text>
            </View>
          )}

          {!loading && messages.length > 0 && (
            <>
              {messages.map((m, idx) => {
                const isPatient = m.sender_role === 'patient';
                return (
                  <View
                    key={m.id}
                    style={[
                      styles.card,
                      idx > 0 && styles.mt16,
                      isPatient ? { borderColor: colors.purpleLight, backgroundColor: colors.white } : null,
                    ]}
                  >
                    <Text style={[styles.label, { marginTop: 0 }]}> 
                      {isPatient ? t('thread.you') : t('thread.provider')} • {formatTime(m.created_at)}
                    </Text>
                    <Text style={[styles.value, { marginTop: 6 }]}>{m.body}</Text>
                  </View>
                );
              })}
            </>
          )}

          <View style={styles.mt24} />

          <Text style={styles.inputLabel}>{t('thread.messageLabel')}</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('thread.messagePlaceholder')}
            placeholderTextColor={colors.grey300}
            multiline
            style={[styles.input, focused && styles.inputFocused, styles.textArea]}
            editable={!busy}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />

          <TouchableOpacity
            style={[styles.btnPrimary, (busy || draft.trim().length === 0) && styles.btnPrimaryDisabled]}
            onPress={onSend}
            disabled={busy || draft.trim().length === 0}
            activeOpacity={0.85}
          >
            <Text style={styles.btnPrimaryText}>{t('thread.send')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
