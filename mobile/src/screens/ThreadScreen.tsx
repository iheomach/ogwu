import { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import type { ConsultMessage, ConsultThread, ScreenPropsBase } from '../types';
import { styles, colors, glassSurface, spacing } from '../ui/styles';
import { t } from '../i18n';
import { threadMessagesList, threadsList, threadsClose } from '../lib/threads';

export type ThreadScreenProps = ScreenPropsBase & {
  threadId: string;
  onBack: () => void;
  onCancel?: () => void;
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}


export function ThreadScreen({ busy, threadId, onBack, onCancel }: ThreadScreenProps) {
  const [loading, setLoading] = useState(true);
  const [thread, setThread] = useState<ConsultThread | null>(null);
  const [messages, setMessages] = useState<ConsultMessage[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  const handleCancelConsult = () => {
    const doCancel = async () => {
      try {
        await threadsClose(threadId);
        setThread(prev => prev ? { ...prev, status: 'closed' } : prev);
        onCancel?.();
      } catch (e: any) {
        Alert.alert('Error', e?.message ?? 'Could not cancel consult.');
      }
    };
    Alert.alert(
      'Cancel consult',
      'This will close the consultation. The provider will no longer be able to reply.',
      [
        { text: 'Keep open', style: 'cancel' },
        { text: 'Cancel consult', style: 'destructive', onPress: doCancel },
      ]
    );
  };

  const handleMenuPress = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Dismiss', 'Cancel consult'], destructiveButtonIndex: 1, cancelButtonIndex: 0 },
        (idx) => { if (idx === 1) handleCancelConsult(); }
      );
    } else {
      Alert.alert('Options', '', [
        { text: 'Cancel consult', style: 'destructive', onPress: handleCancelConsult },
        { text: 'Dismiss', style: 'cancel' },
      ]);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [listRes, msgRes] = await Promise.all([
          threadsList(),
          threadMessagesList(threadId),
        ]);
        if (!mounted) return;
        const found = Array.isArray(listRes?.threads)
          ? (listRes.threads.find((x) => x?.id === threadId) ?? null)
          : null;
        setThread(found);
        setMessages(Array.isArray(msgRes?.messages) ? msgRes.messages : []);
      } catch (e: any) {
        if (!mounted) return;
        Alert.alert(t('common.error'), e?.message ?? t('common.error'));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [threadId]);

  const providerName = thread?.hospital_name
    ?? thread?.doctor?.name
    ?? (thread?.external_provider?.name || null)
    ?? 'Care team';

  // If no messages were auto-inserted (old thread or backend edge case),
  // synthesize the first message from the intake_snapshot on the thread.
  const displayMessages: ConsultMessage[] = (() => {
    if (messages.length > 0) return messages;
    const snap = thread?.intake_snapshot;
    if (!snap) return [];
    const urgencyLabel = { emergency: 'Emergency', urgent: 'Urgent', soon: 'See soon', routine: 'Routine' }[snap.urgency ?? 'routine'] ?? 'Routine';
    const lines: string[] = [urgencyLabel];
    if (snap.summary) lines.push('\n' + snap.summary);
    if (Array.isArray(snap.answers) && snap.answers.length > 0) {
      lines.push('\nTriage responses:');
      for (const { q, a } of snap.answers) {
        if (q && a) lines.push(`• ${q}\n  → ${a}`);
      }
    }
    return [{
      id: 'snapshot',
      thread_id: threadId,
      sender_role: 'patient',
      body: lines.join('\n'),
      created_at: thread?.created_at ?? new Date().toISOString(),
    }];
  })();

  return (
    <SafeAreaView style={styles.container}>

      {/* Toolbar */}
      <View style={styles.assistantToolbar}>
        <TouchableOpacity
          onPress={onBack}
          disabled={busy}
          style={styles.newChatButton}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={20} color={colors.purple} />
          <Text style={styles.newChatButtonText}>Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.assistantToolbarTitle}>{providerName}</Text>
          <Text style={{ fontSize: 11, color: colors.grey500 }}>Health summary sent</Text>
        </View>
        {thread?.status === 'open' && (
          <TouchableOpacity
            onPress={handleMenuPress}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="more-vert" size={22} color={colors.grey500} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >

        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator color={colors.purple} />
          </View>
        ) : (
          <>
            {displayMessages.map((m) => {
              const isPatient = m.sender_role === 'patient';
              const isSystem  = m.sender_role === 'system';

              if (isSystem) {
                return (
                  <View key={m.id} style={{ alignItems: 'center', marginVertical: spacing.sm, paddingHorizontal: spacing.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: glassSurface.divider }} />
                      <Text style={{ fontSize: 12, color: colors.grey500, textAlign: 'center' }}>{m.body}</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: glassSurface.divider }} />
                    </View>
                    <Text style={{ fontSize: 11, color: colors.grey300, marginTop: 4 }}>{formatTime(m.created_at)}</Text>
                  </View>
                );
              }

              return (
                <View
                  key={m.id}
                  style={{ marginBottom: spacing.sm, alignItems: isPatient ? 'flex-end' : 'flex-start' }}
                >
                  <View style={isPatient ? styles.userBubble : styles.assistantBubble}>
                    <Text style={{
                      color: isPatient ? colors.white : colors.grey900,
                      fontSize: 14,
                      lineHeight: 21,
                    }}>
                      {m.body}
                    </Text>
                    <Text style={{
                      fontSize: 11,
                      marginTop: 6,
                      color: isPatient ? 'rgba(255,255,255,0.6)' : colors.grey500,
                      alignSelf: isPatient ? 'flex-end' : 'flex-start',
                    }}>
                      {isPatient ? 'You' : providerName} · {formatTime(m.created_at)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Bottom status bar */}
      <View style={{
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderTopWidth: 1,
        borderTopColor: glassSurface.divider,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}>
        {thread?.status === 'closed' ? (
          <>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error }} />
            <Text style={{ fontSize: 13, color: colors.grey500, flex: 1 }}>
              This conversation has ended.
            </Text>
          </>
        ) : (
          <>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
            <Text style={{ fontSize: 13, color: colors.grey500, flex: 1 }}>
              Summary delivered. {providerName} will respond here once they review it.
            </Text>
          </>
        )}
      </View>

    </SafeAreaView>
  );
}
