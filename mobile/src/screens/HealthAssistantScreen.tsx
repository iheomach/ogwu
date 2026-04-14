import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
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

// ── Inline markdown + phone parser ──────────────────────────────────────────
type Segment = { type: 'text' | 'bold' | 'phone'; content: string };
const PHONE_RE = /^\+?[\d][\d\s\-(.)]{6,}[\d]$/;

function parseMessage(text: string): Segment[] {
  const segs: Segment[] = [];
  const re = /\*\*([^*]+)\*\*|(\+?[\d][\d\s\-(.)]{7,}[\d])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ type: 'text', content: text.slice(last, m.index) });
    if (m[1] !== undefined) {
      segs.push({ type: PHONE_RE.test(m[1].trim()) ? 'phone' : 'bold', content: m[1] });
    } else if (m[2] !== undefined) {
      segs.push({ type: 'phone', content: m[2] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ type: 'text', content: text.slice(last) });
  return segs;
}

function MessageText({ text, color }: { text: string; color: string }) {
  const segs = parseMessage(text);
  return (
    <Text style={{ color, lineHeight: 22, fontSize: 15 }}>
      {segs.map((s, i) => {
        if (s.type === 'bold') return <Text key={i} style={{ fontWeight: '700' }}>{s.content}</Text>;
        if (s.type === 'phone') return (
          <Text
            key={i}
            onPress={() => Linking.openURL(`tel:${s.content.replace(/[\s\-.()\u00A0]/g, '')}`)}
            style={{ color: colors.purple, fontWeight: '600', textDecorationLine: 'underline' }}
          >
            {s.content}
          </Text>
        );
        return <Text key={i}>{s.content}</Text>;
      })}
    </Text>
  );
}

// ── Slot picker ──────────────────────────────────────────────────────────────
type Slot = { starts_at_local: string; display: string; time_zone: string };

function SlotPicker({ slots, hospitalName, onSelect, disabled }: {
  slots: Slot[];
  hospitalName: string;
  onSelect: (slot: Slot) => void;
  disabled: boolean;
}) {
  // Group slots by date label (e.g. "Tue 14 Apr")
  const dates = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const dateLabel = s.display.split(', ')[0]; // "Tue 14 Apr"
      if (!map.has(dateLabel)) map.set(dateLabel, []);
      map.get(dateLabel)!.push(s);
    }
    return Array.from(map.entries()); // [["Tue 14 Apr", [slot, ...]], ...]
  }, [slots]);

  const [selectedDate, setSelectedDate] = useState<string>(dates[0]?.[0] ?? '');
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const timesForDate = dates.find(([d]) => d === selectedDate)?.[1] ?? [];

  const handleConfirm = () => {
    if (!selectedSlot || disabled) return;
    onSelect(selectedSlot);
  };

  return (
    <View style={{
      backgroundColor: '#fff',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'rgba(69,0,80,0.1)',
      overflow: 'hidden',
      marginBottom: spacing.sm,
      shadowColor: colors.purple,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07,
      shadowRadius: 8,
      elevation: 2,
    }}>
      {/* Header */}
      <View style={{ backgroundColor: colors.purple, paddingHorizontal: spacing.md, paddingVertical: 12 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{hospitalName}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>Select an available slot</Text>
      </View>

      {/* Date chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingVertical: 12, gap: 8 }}
      >
        {dates.map(([dateLabel]) => {
          const active = dateLabel === selectedDate;
          return (
            <TouchableOpacity
              key={dateLabel}
              onPress={() => { setSelectedDate(dateLabel); setSelectedSlot(null); }}
              disabled={disabled}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 20,
                backgroundColor: active ? colors.purple : 'rgba(69,0,80,0.06)',
                borderWidth: 1,
                borderColor: active ? colors.purple : 'rgba(69,0,80,0.12)',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : colors.grey700 }}>
                {dateLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Time slots grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.md, paddingBottom: 12, gap: 8 }}>
        {timesForDate.map((slot) => {
          const timeLabel = slot.display.split(', ')[1]; // "8:00 AM"
          const active = selectedSlot?.starts_at_local === slot.starts_at_local;
          return (
            <TouchableOpacity
              key={slot.starts_at_local}
              onPress={() => setSelectedSlot(slot)}
              disabled={disabled}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: active ? colors.purple : 'rgba(69,0,80,0.04)',
                borderWidth: 1,
                borderColor: active ? colors.purple : 'rgba(69,0,80,0.12)',
                minWidth: 80,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? '#fff' : colors.grey700 }}>
                {timeLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Confirm button */}
      <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={!selectedSlot || disabled}
          style={{
            backgroundColor: selectedSlot ? colors.purple : 'rgba(69,0,80,0.2)',
            borderRadius: 12,
            paddingVertical: 13,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
            {selectedSlot ? `Confirm ${selectedSlot.display}` : 'Select a time'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Hospital cards with spring collapse animation ────────────────────────────
function HospitalCard({ h, selected, onPress, disabled }: {
  h: any;
  selected: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={{
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: spacing.md,
        marginBottom: 12,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.purple : 'rgba(69, 0, 80, 0.1)',
        shadowColor: colors.purple,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={{ fontWeight: '700', fontSize: 14, color: colors.grey900, flex: 1, marginRight: 8 }}>
          {h.name}
        </Text>
        {h.distance_km != null && (
          <Text style={{ fontSize: 12, color: colors.purple, fontWeight: '600' }}>{h.distance_km} km</Text>
        )}
      </View>
      <Text style={{ fontSize: 12, color: colors.grey500, marginTop: 3 }}>
        {[h.city, h.state].filter(Boolean).join(', ')}
      </Text>
      {Array.isArray(h.specialties) && h.specialties.length > 0 && (
        <Text style={{ fontSize: 12, color: colors.grey500, marginTop: 3 }} numberOfLines={1}>
          {h.specialties.slice(0, 3).join(' · ')}
        </Text>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {h.has_emergency && (
          <View style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontSize: 10, color: colors.error, fontWeight: '600' }}>Emergency</Text>
          </View>
        )}
        {h.is_onboarded ? (
          <View style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontSize: 10, color: '#10b981', fontWeight: '600' }}>Book online</Text>
          </View>
        ) : (
          <View style={{ backgroundColor: 'rgba(107,114,128,0.08)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontSize: 10, color: colors.grey500, fontWeight: '600' }}>Call to book</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function HospitalCards({ hospitals, onSelect, disabled }: {
  hospitals: any[];
  onSelect: (h: any) => void;
  disabled: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const isAnimating = useRef(false);
  const cardHeights = useRef<number[]>(hospitals.map(() => 110));

  const anims = useRef(
    hospitals.map(() => ({
      translateY: new Animated.Value(0),
      opacity: new Animated.Value(1),
      scale: new Animated.Value(1),
    }))
  ).current;

  const handleSelect = (h: any, selectedIdx: number) => {
    if (isAnimating.current || selectedId !== null || disabled) return;
    isAnimating.current = true;
    setSelectedId(h.id);

    const GAP = 12;
    const animations = hospitals.map((_, i) => {
      if (i === selectedIdx) {
        return Animated.sequence([
          Animated.spring(anims[i].scale, { toValue: 1.025, useNativeDriver: true, speed: 40, bounciness: 6 }),
          Animated.spring(anims[i].scale, { toValue: 1, useNativeDriver: true, speed: 20 }),
        ]);
      }
      let offset = 0;
      if (i < selectedIdx) {
        for (let j = i; j < selectedIdx; j++) offset += cardHeights.current[j] + GAP;
      } else {
        for (let j = selectedIdx + 1; j <= i; j++) offset -= cardHeights.current[j] + GAP;
      }
      return Animated.parallel([
        Animated.spring(anims[i].translateY, {
          toValue: offset,
          useNativeDriver: true,
          damping: 18,
          stiffness: 240,
          mass: 0.7,
        }),
        Animated.timing(anims[i].opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]);
    });

    Animated.parallel(animations).start(() => {
      isAnimating.current = false;
      setCollapsed(true);
      onSelect(h);
    });
  };

  // After collapse: render only the selected card, no leftover layout space
  if (collapsed) {
    const selected = hospitals.find((h) => h.id === selectedId);
    if (!selected) return null;
    return (
      <View style={{ marginBottom: spacing.sm }}>
        <HospitalCard h={selected} selected onPress={() => {}} disabled />
      </View>
    );
  }

  return (
    <View style={{ marginBottom: spacing.sm }}>
      {hospitals.map((h: any, idx: number) => (
        <Animated.View
          key={h.id}
          onLayout={(e) => { cardHeights.current[idx] = e.nativeEvent.layout.height; }}
          style={{
            transform: [{ translateY: anims[idx].translateY }, { scale: anims[idx].scale }],
            opacity: anims[idx].opacity,
            zIndex: selectedId === h.id ? 10 : hospitals.length - idx,
          }}
        >
          <HospitalCard
            h={h}
            selected={selectedId === h.id}
            onPress={() => handleSelect(h, idx)}
            disabled={disabled || !!selectedId}
          />
        </Animated.View>
      ))}
    </View>
  );
}

export function HealthAssistantScreen({ busy, location, lat, lon }: ScreenPropsBase) {
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
    append,
    status,
    error,
    setInput,
    setMessages,
  } = useChat({
    api: apiUrl || '/api/agent/chat',
    fetch: authedFetch as any,
    streamProtocol: 'data',
    body: {
      ...(location ? { location } : {}),
      ...(lat != null ? { lat } : {}),
      ...(lon != null ? { lon } : {}),
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  const handleSelectHospital = (h: any) => {
    append({ role: 'user', content: `I'd like to go with ${h.name}.` });
  };

  const handleSelectSlot = (slot: Slot) => {
    append({ role: 'user', content: `I'd like to book the ${slot.display} slot.` });
  };

  const handleNewSession = async () => {
    setMessages([]);
    setInput('');
    try {
      await AsyncStorage.removeItem('assistantMessages');
    } catch {
      // Non-fatal
    }
  };

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

          {/* Toolbar */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(69, 0, 80, 0.07)',
          }}>
            <Text style={{ color: colors.purple, fontWeight: '700', fontSize: 15 }}>
              {t('assistant.title')}
            </Text>
            <TouchableOpacity
              onPress={handleNewSession}
              disabled={isLoading || messages.length === 0}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                opacity: messages.length === 0 ? 0.35 : 1,
              }}
              accessibilityRole="button"
              accessibilityLabel="Start new session"
              activeOpacity={0.7}
            >
              <MaterialIcons name="add-comment" size={16} color={colors.purple} />
              <Text style={{ color: colors.purple, fontSize: 13, fontWeight: '600' }}>New chat</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 80 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Greeting bubble */}
            <View style={glassBubbleStyle}>
              <Text style={{ color: colors.grey700, lineHeight: 20, fontSize: 14 }}>
                {t('assistant.helper')}
              </Text>
            </View>

            {messages.map((m: any, idx: number) => {
              const role = (m as any)?.role;
              const text = messageText(m);
              const parts = (m as any)?.parts || [];
              const toolParts = parts.filter((p: any) => p.type?.startsWith('tool-'));

              const isHospitalSelection = role === 'user' && text.startsWith("I'd like to go with ");
              const isSlotSelection = role === 'user' && text.startsWith("I'd like to book the ");

              // Suppress text bubble when this message renders hospital cards or slot picker
              const hasHospitalCards = toolParts.some((part: any) => {
                const invocation = part.toolInvocation;
                const toolName = invocation?.toolName ?? (part.type ?? '').replace('tool-', '');
                const invState = part.state ?? invocation?.state ?? '';
                if (toolName !== 'searchHospitals') return false;
                if (invState !== 'output-available' && invState !== 'result') return false;
                const hospitals =
                  part.output?.hospitals ?? part.result?.hospitals ??
                  invocation?.result?.hospitals ?? invocation?.output?.hospitals ??
                  (Array.isArray(part.output) ? part.output : null) ??
                  (Array.isArray(part.result) ? part.result : null);
                return Array.isArray(hospitals) && hospitals.length > 0;
              });

              const hasSlotPicker = toolParts.some((part: any) => {
                const invocation = part.toolInvocation;
                const toolName = invocation?.toolName ?? (part.type ?? '').replace('tool-', '');
                const invState = part.state ?? invocation?.state ?? '';
                if (toolName !== 'getHospitalBookingInfo') return false;
                if (invState !== 'output-available' && invState !== 'result') return false;
                const output = part.output ?? part.result ?? invocation?.result ?? invocation?.output;
                return output?.type === 'onboarded' && Array.isArray(output?.available_slots) && output.available_slots.length > 0;
              });

              // Strip numbered/bulleted list items from text when UI replaces them
              const displayText = (hasHospitalCards || hasSlotPicker)
                ? text
                    .split('\n')
                    .filter((line) => !/^\s*[-•*]\s+\S|^\s*\d+\.\s+\S/.test(line))
                    .join('\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim()
                : text;

              return (
                <View key={(m as any)?.id || `${role}-${idx}`}>
                  {displayText && !isHospitalSelection && !isSlotSelection && (
                    <View style={role === 'user' ? userBubbleStyle : glassBubbleStyle}>
                      <MessageText
                        text={displayText}
                        color={role === 'user' ? colors.white : colors.grey900}
                      />
                    </View>
                  )}
                  {toolParts.map((part: any) => {
                    // Detect searchHospitals result across SDK format variants
                    const partType = part.type ?? '';
                    const invocation = part.toolInvocation;
                    const toolName = invocation?.toolName ?? partType.replace('tool-', '');
                    const invState = part.state ?? invocation?.state ?? '';
                    const isHospitalResult =
                      toolName === 'searchHospitals' &&
                      (invState === 'output-available' || invState === 'result');

                    if (isHospitalResult) {
                      // Try every possible field path across SDK versions
                      const hospitals =
                        part.output?.hospitals ??
                        part.result?.hospitals ??
                        invocation?.result?.hospitals ??
                        invocation?.output?.hospitals ??
                        (Array.isArray(part.output) ? part.output : null) ??
                        (Array.isArray(part.result) ? part.result : null);


                      if (Array.isArray(hospitals) && hospitals.length > 0) {
                        return (
                          <HospitalCards
                            key={`hospitals-${part.toolCallId ?? partType}`}
                            hospitals={hospitals}
                            onSelect={handleSelectHospital}
                            disabled={isLoading}
                          />
                        );
                      }
                    }
                    // Detect getHospitalBookingInfo result with slots
                    const isSlotResult =
                      toolName === 'getHospitalBookingInfo' &&
                      (invState === 'output-available' || invState === 'result');

                    if (isSlotResult) {
                      const output = part.output ?? part.result ?? invocation?.result ?? invocation?.output;
                      if (output?.type === 'onboarded' && Array.isArray(output?.available_slots) && output.available_slots.length > 0) {
                        return (
                          <SlotPicker
                            key={`slots-${part.toolCallId ?? partType}`}
                            slots={output.available_slots}
                            hospitalName={output.hospital_name ?? 'Hospital'}
                            onSelect={handleSelectSlot}
                            disabled={isLoading}
                          />
                        );
                      }
                    }

                    return renderToolInvocation(part);
                  })}
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
