import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';
import {
  Alert,
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

import { Calendar } from 'react-native-calendars';
import { supabase } from '../../lib/supabase';
import { threadsCreate } from '../lib/threads';
import type { ScreenPropsBase } from '../types';
import { colors, spacing, styles } from '../ui/styles';
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
    <View key={`tool-${part.toolCallId}`} style={styles.toolStatusRow}>
      <Text style={[styles.toolStatusText, { color: statusColor }]}>{statusText}</Text>
    </View>
  ) : null;
}


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

// ── Add to Google Calendar button ────────────────────────────────────────────
function toGCalDate(isoUtc: string): string {
  // Converts ISO UTC string to YYYYMMDDTHHmmssZ
  return isoUtc.replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace('+00:00', 'Z');
}

function AddToCalendarButton({ startsAt, meetingUrl, hospitalName }: {
  startsAt: string;
  meetingUrl: string;
  hospitalName: string;
}) {
  const calendarUrl = useMemo(() => {
    const start = toGCalDate(startsAt);
    // Add 30 minutes for end time
    const endDate = new Date(startsAt);
    endDate.setMinutes(endDate.getMinutes() + 30);
    const end = toGCalDate(endDate.toISOString());
    const title = encodeURIComponent(`Appointment at ${hospitalName}`);
    const details = encodeURIComponent(`Join Google Meet: ${meetingUrl}`);
    const location = encodeURIComponent(meetingUrl);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}`;
  }, [startsAt, meetingUrl, hospitalName]);

  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(calendarUrl)}
      activeOpacity={0.8}
      style={styles.gcalButton}
    >
      {/* Google Calendar logo colours */}
      <View style={styles.gcalIconOuter}>
        <View style={styles.gcalIconBorder} />
        <View style={styles.gcalIconHeader} />
        <View style={styles.gcalIconDateWrap}>
          <Text style={styles.gcalIconDateText}>31</Text>
        </View>
      </View>
      <View style={styles.spacer}>
        <Text style={styles.gcalLabel}>Add to Google Calendar</Text>
        <Text style={styles.gcalSubtitle}>Includes Google Meet link</Text>
      </View>
      <MaterialIcons name="open-in-new" size={16} color="#4285F4" />
    </TouchableOpacity>
  );
}

// ── Slot picker ──────────────────────────────────────────────────────────────
type Slot = { starts_at_local: string; display: string; time_zone: string };

function SlotPicker({ slots, hospitalName, hospitalId, onSelect, disabled }: {
  slots: Slot[];
  hospitalName: string;
  hospitalId: string;
  onSelect: (slot: Slot, hospitalId: string) => void;
  disabled: boolean;
}) {
  // Build map: 'yyyy-MM-dd' -> Slot[], deduped by starts_at_local
  const slotsByDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    const seen = new Set<string>();
    for (const s of slots) {
      if (seen.has(s.starts_at_local)) continue;
      seen.add(s.starts_at_local);
      const dateKey = s.starts_at_local.split('T')[0];
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(s);
    }
    return map;
  }, [slots]);

  const firstAvailable = useMemo(() => {
    const keys = [...slotsByDate.keys()].sort();
    return keys[0] ?? null;
  }, [slotsByDate]);

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(firstAvailable);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [textDate, setTextDate] = useState<string>('');
  const [inputFocused, setInputFocused] = useState(false);

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    for (const dateKey of slotsByDate.keys()) {
      marks[dateKey] = {
        marked: true,
        dotColor: dateKey === selectedDateKey ? '#fff' : colors.purple,
        selected: dateKey === selectedDateKey,
        selectedColor: colors.purple,
      };
    }
    return marks;
  }, [slotsByDate, selectedDateKey]);

  const timesForDate = selectedDateKey ? (slotsByDate.get(selectedDateKey) ?? []) : [];

  const handleDayPress = useCallback((day: { dateString: string }) => {
    const key = day.dateString;
    if (!slotsByDate.has(key)) return;
    setSelectedDateKey(key);
    setSelectedSlot(null);
    const [y, m, d] = key.split('-');
    setTextDate(`${m}/${d}/${y}`);
  }, [slotsByDate]);

  const handleTextChange = (text: string) => {
    setTextDate(text);
    const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      const key = `${match[3]}-${match[1]}-${match[2]}`;
      if (slotsByDate.has(key)) {
        setSelectedDateKey(key);
        setSelectedSlot(null);
      }
    }
  };

  const handleConfirm = () => {
    if (!selectedSlot || disabled) return;
    onSelect(selectedSlot, hospitalId);
  };

  return (
    <View style={styles.slotPickerContainer}>
      {/* Header */}
      <View style={styles.slotPickerHeader}>
        <Text style={styles.slotPickerHospitalName}>{hospitalName}</Text>
        <Text style={styles.slotPickerSubtitle}>Select an available date and time</Text>
      </View>

      {/* Date text input */}
      <View style={{ paddingHorizontal: spacing.md, paddingTop: 14, paddingBottom: 8 }}>
        <Text style={[styles.slotPickerSectionLabel, { marginBottom: 6 }]}>
          Jump to date
        </Text>
        <TextInput
          value={textDate}
          onChangeText={handleTextChange}
          placeholder="MM/DD/YYYY"
          placeholderTextColor={colors.grey300}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          editable={!disabled}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          style={{
            borderWidth: 1.5,
            borderColor: inputFocused ? colors.purple : 'rgba(69,0,80,0.15)',
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontSize: 15,
            color: colors.grey900,
            backgroundColor: 'rgba(69,0,80,0.02)',
            letterSpacing: 1,
          }}
        />
      </View>

      {/* Calendar */}
      <Calendar
        current={selectedDateKey ?? undefined}
        onDayPress={handleDayPress}
        markedDates={markedDates}
        disableAllTouchEventsForDisabledDays
        enableSwipeMonths
        theme={{
          calendarBackground: '#fff',
          selectedDayBackgroundColor: colors.purple,
          selectedDayTextColor: '#fff',
          todayTextColor: colors.purple,
          dayTextColor: colors.grey900,
          textDisabledColor: 'rgba(0,0,0,0.18)',
          dotColor: colors.purple,
          selectedDotColor: '#fff',
          arrowColor: colors.purple,
          monthTextColor: colors.grey900,
          textDayFontWeight: '500',
          textMonthFontWeight: '700',
          textDayHeaderFontWeight: '600',
          textDayFontSize: 13,
          textMonthFontSize: 14,
          textDayHeaderFontSize: 11,
        }}
      />

      {/* Time slots */}
      {selectedDateKey && (
        <View style={{ paddingHorizontal: spacing.md, paddingTop: 4, paddingBottom: 12 }}>
          <Text style={[styles.slotPickerSectionLabel, { marginBottom: 10 }]}>
            Available times
          </Text>
          {timesForDate.length === 0 ? (
            <Text style={{ fontSize: 13, color: colors.grey500 }}>No slots available for this date.</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {timesForDate.map((slot) => {
                const timeLabel = slot.display.split(', ')[1];
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
          )}
        </View>
      )}

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
          <Text style={styles.slotConfirmBtnText}>
            {selectedSlot ? `Confirm ${selectedSlot.display}` : 'Select a time to confirm'}
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
      style={[
        styles.hospitalCard,
        { borderWidth: selected ? 2 : 1, borderColor: selected ? colors.purple : 'rgba(69, 0, 80, 0.1)' },
      ]}
    >
      <View style={styles.hospitalCardHeader}>
        <Text style={styles.hospitalCardName}>{h.name}</Text>
        {h.distance_km != null && (
          <Text style={styles.hospitalCardDistance}>{h.distance_km} km</Text>
        )}
      </View>
      <Text style={styles.hospitalCardLocation}>
        {[h.city, h.state].filter(Boolean).join(', ')}
      </Text>
      {Array.isArray(h.specialties) && h.specialties.length > 0 && (
        <Text style={styles.hospitalCardLocation} numberOfLines={1}>
          {h.specialties.slice(0, 3).join(' · ')}
        </Text>
      )}
      <View style={styles.hospitalCardBadgesRow}>
        {h.has_emergency && (
          <View style={styles.emergencyBadge}>
            <Text style={styles.emergencyBadgeText}>Emergency</Text>
          </View>
        )}
        {h.is_onboarded ? (
          <View style={styles.bookOnlineBadge}>
            <Text style={styles.bookOnlineBadgeText}>Book online</Text>
          </View>
        ) : (
          <View style={styles.callToBookBadge}>
            <Text style={styles.callToBookBadgeText}>Call to book</Text>
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

export function HealthAssistantScreen({ busy, location, lat, lon, onSendToHospital, onOpenThread }: ScreenPropsBase & { onSendToHospital?: () => void; onOpenThread?: (threadId: string) => void }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [sendingToHospital, setSendingToHospital] = useState(false);
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
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  const handleSelectHospital = (h: any) => {
    append({ role: 'user', content: `I'd like to go with ${h.name} (hospital_id: ${h.id}).` });
  };

  const handleSelectSlot = (slot: Slot, hospitalId: string) => {
    append({ role: 'user', content: `I'd like to book the ${slot.display} slot (hospital_id: ${hospitalId}, starts_at_local: ${slot.starts_at_local}, time_zone: ${slot.time_zone}).` });
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

  // Tools that render their own interactive UI — suppress the spinner while
  // the AI narrates alongside them so the calendar/hospital list isn't cluttered.
  const UI_RENDERING_TOOLS = new Set(['searchHospitals', 'getHospitalBookingInfo', 'bookAppointment']);

  // Derive a short label from whichever tool is currently active.
  const thinkingLabel = useMemo(() => {
    if (!isLoading) return null;

    // If a UI-rendering tool has already produced a result, the interactive
    // widget is visible — hide the spinner while the AI writes its narration.
    const hasRenderedUI = messages.some((m: any) => {
      if (m.role !== 'assistant') return false;
      return ((m as any).parts ?? []).some((p: any) => {
        const tn = p.toolInvocation?.toolName ?? (p.type ?? '').replace('tool-', '');
        const state = p.state ?? p.toolInvocation?.state ?? '';
        return UI_RENDERING_TOOLS.has(tn) && (state === 'output-available' || state === 'result');
      });
    });
    if (hasRenderedUI) return null;

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

  // Show send-summary button as soon as bookAppointment succeeds.
  const endConversationData = useMemo(() => {
    for (const m of [...messages].reverse()) {
      if ((m as any).role !== 'assistant') continue;
      const parts: any[] = (m as any).parts ?? [];
      for (const part of parts) {
        const toolName = (part.toolInvocation?.toolName) ?? (part.type ?? '').replace('tool-', '');
        const state = part.state ?? part.toolInvocation?.state ?? '';
        if (toolName === 'bookAppointment' && (state === 'output-available' || state === 'result')) {
          const output = part.output ?? part.result ?? part.toolInvocation?.result ?? part.toolInvocation?.output;
          if (output?.success && output?.hospital_id) {
            return { hospitalId: output.hospital_id as string, hospitalName: output.hospital_name as string };
          }
        }
      }
    }
    return null;
  }, [messages]);

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
          <View style={styles.assistantToolbar}>
            <Text style={styles.assistantToolbarTitle}>{t('assistant.title')}</Text>
            <TouchableOpacity
              onPress={handleNewSession}
              disabled={isLoading || messages.length === 0}
              style={[styles.newChatButton, { opacity: messages.length === 0 ? 0.35 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Start new session"
              activeOpacity={0.7}
            >
              <MaterialIcons name="add-comment" size={16} color={colors.purple} />
              <Text style={styles.newChatButtonText}>New chat</Text>
            </TouchableOpacity>
          </View>



          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 80 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Greeting bubble */}
            <View style={styles.assistantBubble}>
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


              // ── Tool call detection ──────────────────────────────────────────────
              // "Called" = tool exists in any state (used to pre-suppress streaming text).
              // "Ready"  = tool has a usable result (used to render the UI widget).

              const searchHospitalsCalled = toolParts.some((p: any) =>
                (p.toolInvocation?.toolName ?? (p.type ?? '').replace('tool-', '')) === 'searchHospitals'
              );
              const hasHospitalCards = searchHospitalsCalled && toolParts.some((part: any) => {
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

              // Suppress slot list in streaming text as soon as getHospitalBookingInfo is called.
              const slotPickerCalled = toolParts.some((p: any) =>
                (p.toolInvocation?.toolName ?? (p.type ?? '').replace('tool-', '')) === 'getHospitalBookingInfo'
              );
              const hasSlotPicker = slotPickerCalled && toolParts.some((part: any) => {
                const invocation = part.toolInvocation;
                const toolName = invocation?.toolName ?? (part.type ?? '').replace('tool-', '');
                const invState = part.state ?? invocation?.state ?? '';
                if (toolName !== 'getHospitalBookingInfo') return false;
                if (invState !== 'output-available' && invState !== 'result') return false;
                const output = part.output ?? part.result ?? invocation?.result ?? invocation?.output;
                return output?.type === 'onboarded' && Array.isArray(output?.available_slots) && output.available_slots.length > 0;
              });

              const bookAppointmentCalled = toolParts.some((p: any) =>
                (p.toolInvocation?.toolName ?? (p.type ?? '').replace('tool-', '')) === 'bookAppointment'
              );
              const hasCalendarButton = bookAppointmentCalled && toolParts.some((part: any) => {
                const invocation = part.toolInvocation;
                const toolName = invocation?.toolName ?? (part.type ?? '').replace('tool-', '');
                const invState = part.state ?? invocation?.state ?? '';
                if (toolName !== 'bookAppointment') return false;
                if (invState !== 'output-available' && invState !== 'result') return false;
                const output = part.output ?? part.result ?? invocation?.result ?? invocation?.output;
                return output?.success && output?.meeting_url;
              });

              // Strip numbered/bulleted list items as soon as the tool is called (not just
              // when results arrive) so streaming slot/hospital text never flashes on screen.
              // The \d+\.(\s|$) pattern catches partial lines like "53." before the slot
              // text has streamed in, not just complete "53. 9:00 AM" lines.
              let displayText = (searchHospitalsCalled || slotPickerCalled)
                ? text
                    .split('\n')
                    .filter((line) => !/^\s*[-•*]\s+\S|^\s*\d+\.(\s|$)|^\s*\d+\s*$/.test(line))
                    .join('\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim()
                : text;

              // Extract calendar button data for inline rendering
              let calendarData: { startsAt: string; meetingUrl: string; hospitalName: string } | null = null;
              if (hasCalendarButton) {
                for (const part of toolParts) {
                  const inv = part.toolInvocation;
                  const tn = inv?.toolName ?? (part.type ?? '').replace('tool-', '');
                  if (tn !== 'bookAppointment') continue;
                  const output = part.output ?? part.result ?? inv?.result ?? inv?.output;
                  if (output?.success && output?.meeting_url && output?.starts_at) {
                    calendarData = { startsAt: output.starts_at, meetingUrl: output.meeting_url, hospitalName: output.hospital_name ?? 'Hospital' };
                    break;
                  }
                }
                displayText = displayText
                  .replace(/\[.*?\]\(https?:\/\/meet\.google\.com\/[^\s)]+\)/g, '')
                  .replace(/https?:\/\/meet\.google\.com\/\S+/g, '')
                  .replace(/[Yy]ou can join.*?[:.][^\n]*/g, '')
                  .replace(/[Hh]ere(?:'s| is) your.*?(?:link|meet)[^.!\n]*[.!]?/g, '')
                  .replace(/[Gg]oogle [Mm]eet link[^.!\n]*/g, '')
                  .replace(/meeting link[^.!\n]*/gi, '')
                  // Remove lines that are blank or contain only punctuation/whitespace
                  .split('\n')
                  .filter((line) => line.trim().replace(/[.!?,;:\-–—]/g, '').trim().length > 0)
                  .join('\n')
                  .replace(/\n{3,}/g, '\n\n')
                  .trim();
              }

              return (
                <View key={(m as any)?.id || `${role}-${idx}`}>
                  {(displayText || calendarData) && !isHospitalSelection && !isSlotSelection && (
                    <View style={role === 'user' ? styles.userBubble : styles.assistantBubble}>
                      {!!displayText && (
                        <MessageText
                          text={displayText}
                          color={role === 'user' ? colors.white : colors.grey900}
                        />
                      )}
                      {calendarData && (
                        <AddToCalendarButton
                          startsAt={calendarData.startsAt}
                          meetingUrl={calendarData.meetingUrl}
                          hospitalName={calendarData.hospitalName}
                        />
                      )}
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
                            hospitalId={output.hospital_id ?? ''}
                            onSelect={handleSelectSlot}
                            disabled={isLoading}
                          />
                        );
                      }
                    }

                    // Detect bookAppointment success result
                    const isBookingResult =
                      toolName === 'bookAppointment' &&
                      (invState === 'output-available' || invState === 'result');

                    if (isBookingResult) return null; // rendered inside bubble above

                    return renderToolInvocation(part);
                  })}
                </View>
              );
            })}

            {isLoading && thinkingLabel && (
              <View style={[styles.assistantBubble, { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }]}>
                <ActivityIndicator color={colors.purple} size="small" />
                <Text style={{ color: colors.grey500, fontSize: 13, fontStyle: 'italic' }}>
                  {thinkingLabel}
                </Text>
              </View>
            )}

            {!!error && (
              <View style={[styles.assistantBubble, { backgroundColor: 'rgba(239, 68, 68, 0.06)', borderColor: 'rgba(239, 68, 68, 0.2)' }]}>
                <Text style={{ color: colors.error, fontSize: 14, lineHeight: 20 }}>
                  {String((error as any)?.message || error)}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Bottom bar — input OR send-to-hospital button */}
          <View style={styles.chatBottomBar}>
            {endConversationData ? (
              /* Conversation ended — replace input with full-width purple send button */
              <TouchableOpacity
                onPress={async () => {
                  if (sendingToHospital) return;
                  try {
                    setSendingToHospital(true);
                    const res = await threadsCreate({ hospital_id: endConversationData.hospitalId });
                    const threadId = res?.thread?.id;
                    if (threadId && onOpenThread) onOpenThread(threadId);
                  } catch (e: any) {
                    Alert.alert('Error', e?.message ?? 'Could not send summary');
                  } finally {
                    setSendingToHospital(false);
                  }
                }}
                activeOpacity={0.85}
                disabled={sendingToHospital}
                style={styles.sendSummaryButton}
              >
                {sendingToHospital
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <>
                      <Text style={styles.sendSummaryButtonText}>
                        Send summary to {endConversationData.hospitalName}
                      </Text>
                      <MaterialIcons name="arrow-forward" size={20} color={colors.white} />
                    </>
                }
              </TouchableOpacity>
            ) : (
              /* Normal chat input */
              <View style={styles.chatInputBar}>
                <TextInput
                  value={input}
                  onChangeText={(text) => setInput(text)}
                  placeholder={t('assistant.placeholder')}
                  placeholderTextColor="rgba(107, 114, 128, 0.65)"
                  style={styles.chatTextInput}
                  multiline
                />
                <TouchableOpacity
                  style={[
                    styles.chatSendButton,
                    { backgroundColor: (busy || isLoading || !apiUrl) ? 'rgba(69, 0, 80, 0.35)' : 'rgba(69, 0, 80, 0.6)' },
                  ]}
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
            )}
          </View>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
