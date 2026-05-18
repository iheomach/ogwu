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
import * as ExpoCalendar from 'expo-calendar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { Calendar } from 'react-native-calendars';
import { threadsCreate } from '../lib/threads';
import type { ScreenPropsBase } from '../types';
import { colors, spacing, styles } from '../ui/styles';
import { t } from '../i18n';
import { useAgentChat } from '../lib/useAgentChat';
import { supabase } from '../../lib/supabase';

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

  const toolName = part.toolName ?? part.toolInvocation?.toolName ?? part.type.replace('tool-', '');
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

// ── Calendar helpers ─────────────────────────────────────────────────────────
function toGCalDate(isoUtc: string): string {
  return isoUtc.replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace('+00:00', 'Z');
}

// ── Add to Google Calendar button ────────────────────────────────────────────
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

// ── Add to Apple Calendar button (iOS only) ──────────────────────────────────
function AddToAppleCalendarButton({ startsAt, meetingUrl, hospitalName }: {
  startsAt: string;
  meetingUrl: string | null;
  hospitalName: string;
}) {
  const handlePress = async () => {
    try {
      const start = new Date(startsAt);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      await ExpoCalendar.createEventInCalendarAsync({
        title: `Appointment at ${hospitalName}`,
        startDate: start,
        endDate: end,
        notes: meetingUrl ? `Join online: ${meetingUrl}` : 'Ogwu Health Appointment',
        ...(meetingUrl ? { url: meetingUrl } : {}),
      });
    } catch {
      Alert.alert('Could not open Calendar', 'Please add the appointment manually.');
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8} style={styles.appleCalButton}>
      <MaterialIcons name="event" size={22} color="#1C1C1E" />
      <View style={styles.spacer}>
        <Text style={styles.appleCalLabel}>Add to Apple Calendar</Text>
        {meetingUrl && <Text style={styles.appleCalSubtitle}>Includes meeting link</Text>}
      </View>
      <MaterialIcons name="open-in-new" size={16} color="#1C1C1E" />
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
  // Build map: 'yyyy-MM-dd' -> Slot[], deduped and filtered to future slots only.
  // Slots are in the clinic's timezone (slot.time_zone), so we compare against
  // the current time expressed in that same timezone — not the device clock.
  const slotsByDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    const seen = new Set<string>();
    const tz = slots[0]?.time_zone ?? 'UTC';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
    const nowClinicStr = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
    for (const s of slots) {
      if (seen.has(s.starts_at_local)) continue;
      if (s.starts_at_local <= nowClinicStr) continue; // skip slots that have already passed
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

  // Sync selection when firstAvailable resolves (e.g. after mount or slots change)
  useEffect(() => {
    if (firstAvailable && !selectedDateKey) {
      setSelectedDateKey(firstAvailable);
      const [y, m, d] = firstAvailable.split('-');
      setTextDate(`${m}/${d}/${y}`);
    }
  }, [firstAvailable, selectedDateKey]);

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

  // All provided slots are in the past — session was resumed with stale data
  const slotsExpired = slots.length > 0 && slotsByDate.size === 0;

  if (slotsExpired) {
    return (
      <View style={styles.slotPickerContainer}>
        <View style={styles.slotPickerHeader}>
          <Text style={styles.slotPickerHospitalName}>{hospitalName}</Text>
        </View>
        <View style={{ paddingHorizontal: 16, paddingVertical: 20, alignItems: 'center' }}>
          <MaterialIcons name="event-busy" size={32} color={colors.grey300} />
          <Text style={{ marginTop: 10, fontSize: 14, color: colors.grey500, textAlign: 'center' }}>
            These slots are no longer available. Ask the assistant to search for new availability.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.slotPickerContainer}>
      {/* Header */}
      <View style={styles.slotPickerHeader}>
        <Text style={styles.slotPickerHospitalName}>{hospitalName}</Text>
        <Text style={styles.slotPickerSubtitle}>
          {'Select an available date and time · '}
          {new Intl.DateTimeFormat('en-US', {
            timeZone: slots[0]?.time_zone ?? 'UTC',
            timeZoneName: 'short',
          }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? slots[0]?.time_zone}
        </Text>
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
                const timePart = slot.display.split(', ')[1];
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
                      {timePart}
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
  const [clearingHistory, setClearingHistory] = useState(false);
  const apiBase = useMemo(() => {
    const base = process.env.EXPO_PUBLIC_API_URL;
    if (!base) return null;
    return `${base.replace(/\/$/, '')}/api/agent`;
  }, []);

  const [pastSessionMessages, setPastSessionMessages] = useState<any[]>([]);
  const [isPastSession, setIsPastSession] = useState(false);
  const [pastSessionLoading, setPastSessionLoading] = useState(false);

  const {
    messages,
    input,
    handleSubmit,
    append,
    isLoading,
    error,
    setInput,
    setMessages,
    resetState,
    startNewSession,
    resumePreviousSession,
    contextSummary,
    fetchContextSummary,
    hasPreviousSession,
    loadPastSession,
  } = useAgentChat({ apiBase, location, lat, lon });

  const handleOpenPastSession = async () => {
    setPastSessionLoading(true);
    const loaded = await loadPastSession();
    setPastSessionMessages(loaded);
    setIsPastSession(true);
    setPastSessionLoading(false);
  };

  const handleClosePastSession = () => {
    setIsPastSession(false);
    setPastSessionMessages([]);
  };

  const handleSelectHospital = (h: any) => {
    append({ role: 'user', content: `I'd like to go with ${h.name} (hospital_id: ${h.id}).` });
  };

  const handleSelectSlot = (slot: Slot, hospitalId: string) => {
    append({ role: 'user', content: `I'd like to book the ${slot.display} slot (hospital_id: ${hospitalId}, starts_at_local: ${slot.starts_at_local}, time_zone: ${slot.time_zone}).` });
  };

  const handleClearChat = async () => {
    startNewSession();
    try {
      await AsyncStorage.setItem('assistantMessages', '[]');
    } catch {
      // Non-fatal
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear agent history',
      'This removes all conversation memory. The agent will have no recollection of previous sessions. Your profile and triage data are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            if (!apiBase) return;
            setClearingHistory(true);
            try {
              const { data } = await supabase.auth.getSession();
              const token = data.session?.access_token;
              if (token) {
                await fetch(`${apiBase}/history`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${token}` },
                });
              }
              startNewSession(false);
              await AsyncStorage.setItem('assistantMessages', '[]');
            } catch {
              // Non-fatal — checkpoint may already be empty
            } finally {
              setClearingHistory(false);
            }
          },
        },
      ]
    );
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
        const tn = p.toolInvocation?.toolName ?? p.toolName ?? (p.type ?? '').replace('tool-', '');
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
        const toolName = part.toolInvocation?.toolName ?? part.toolName ?? (part.type ?? '').replace('tool-', '');
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
        if (saved) {
          const parsed = JSON.parse(saved);
          setMessages(parsed);
          if (parsed.length === 0) fetchContextSummary();
        } else {
          fetchContextSummary();
        }
      } catch (err) {
        console.error('Failed to restore assistant messages:', err);
        fetchContextSummary();
      } finally {
        setIsInitialized(true);
      }
    })();
  }, [setMessages, fetchContextSummary]);

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

  // Index of the most recent searchHospitals message — any SlotPicker from
  // an earlier message is superseded (new hospital search started) and hidden.
  const lastSearchHospitalsIdx = useMemo(
    () => messages.reduce((best: number, m: any, i: number) => {
      const parts: any[] = (m as any)?.parts || [];
      const called = parts.filter((p) => p.type?.startsWith('tool-')).some((p) =>
        (p.toolInvocation?.toolName ?? p.toolName ?? (p.type ?? '').replace('tool-', '')) === 'searchHospitals'
      );
      return called ? i : best;
    }, -1),
    [messages]
  );

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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={handleClearHistory}
                disabled={isLoading || clearingHistory}
                style={[styles.toolbarIconBtn, { opacity: (isLoading || clearingHistory) ? 0.35 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Clear agent history"
                activeOpacity={0.7}
              >
                <MaterialIcons name="delete-sweep" size={14} color={colors.purple} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleClearChat}
                disabled={isLoading || messages.length === 0}
                style={[styles.toolbarIconBtn, { opacity: messages.length === 0 ? 0.35 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Clear chat"
                activeOpacity={0.7}
              >
                <MaterialIcons name="clear-all" size={14} color={colors.purple} />
              </TouchableOpacity>
            </View>
          </View>



          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 80 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Greeting — last session card or default bubble */}
            {contextSummary && !isPastSession ? (
              <TouchableOpacity
                onPress={handleOpenPastSession}
                activeOpacity={0.85}
                disabled={pastSessionLoading}
                style={styles.lastSessionCard}
              >
                <View style={styles.lastSessionHeader}>
                  <MaterialIcons name="history" size={13} color={colors.purple} />
                  <Text style={styles.lastSessionLabel}>Last session</Text>
                  {pastSessionLoading
                    ? <ActivityIndicator size="small" color={colors.purple} style={{ marginLeft: 'auto' }} />
                    : <MaterialIcons name="chevron-right" size={16} color={colors.purple} style={{ marginLeft: 'auto' } as any} />
                  }
                </View>
                <Text style={styles.lastSessionSummary}>{contextSummary}</Text>
                {hasPreviousSession && (
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation?.(); resumePreviousSession(); handleClosePastSession(); }}
                    activeOpacity={0.8}
                    style={styles.lastSessionContinueBtn}
                  >
                    <Text style={styles.lastSessionContinueBtnText}>Continue conversation</Text>
                    <MaterialIcons name="arrow-forward" size={14} color="#fff" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ) : !isPastSession ? (
              <View style={styles.assistantBubble}>
                <Text style={{ color: colors.grey700, lineHeight: 20, fontSize: 14 }}>
                  {t('assistant.helper')}
                </Text>
              </View>
            ) : null}

            {/* ── Past session view ─────────────────────────────────────────── */}
            {isPastSession && (
              <>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: 'rgba(69,0,80,0.05)', borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16,
                }}>
                  <MaterialIcons name="history" size={14} color={colors.purple} />
                  <Text style={{ fontSize: 12, color: colors.purple, fontWeight: '600', flex: 1 }}>
                    Past session
                  </Text>
                  <TouchableOpacity onPress={handleClosePastSession} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="close" size={16} color={colors.grey500} />
                  </TouchableOpacity>
                </View>

                {pastSessionMessages.map((m: any, idx: number) => {
                  const role = m?.role;
                  const text = messageText(m);
                  const toolParts = (m?.parts ?? []).filter((p: any) => p.type?.startsWith('tool-'));

                  // Hospital selection message → choice chip
                  if (role === 'user' && text.startsWith("I'd like to go with ")) {
                    const match = text.match(/^I'd like to go with (.+?) \(hospital_id:/);
                    const name = match?.[1] ?? 'Hospital';
                    return (
                      <View key={`ps-${idx}`} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        backgroundColor: 'rgba(69,0,80,0.05)', borderRadius: 12,
                        borderWidth: 1, borderColor: 'rgba(69,0,80,0.12)',
                        padding: 12, marginBottom: 8, alignSelf: 'flex-end', maxWidth: '85%',
                      }}>
                        <View style={{
                          width: 28, height: 28, borderRadius: 8,
                          backgroundColor: 'rgba(69,0,80,0.1)', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <MaterialIcons name="local-hospital" size={15} color={colors.purple} />
                        </View>
                        <View>
                          <Text style={{ fontSize: 10, color: colors.grey500, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Hospital selected
                          </Text>
                          <Text style={{ fontSize: 14, color: colors.grey900, fontWeight: '600', marginTop: 1 }}>
                            {name}
                          </Text>
                        </View>
                      </View>
                    );
                  }

                  // Slot selection message → booking chip
                  if (role === 'user' && text.startsWith("I'd like to book the ")) {
                    const match = text.match(/^I'd like to book the (.+?) slot/);
                    const slot = match?.[1] ?? 'Appointment';
                    return (
                      <View key={`ps-${idx}`} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        backgroundColor: 'rgba(69,0,80,0.05)', borderRadius: 12,
                        borderWidth: 1, borderColor: 'rgba(69,0,80,0.12)',
                        padding: 12, marginBottom: 8, alignSelf: 'flex-end', maxWidth: '85%',
                      }}>
                        <View style={{
                          width: 28, height: 28, borderRadius: 8,
                          backgroundColor: 'rgba(69,0,80,0.1)', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <MaterialIcons name="event" size={15} color={colors.purple} />
                        </View>
                        <View>
                          <Text style={{ fontSize: 10, color: colors.grey500, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Appointment booked
                          </Text>
                          <Text style={{ fontSize: 14, color: colors.grey900, fontWeight: '600', marginTop: 1 }}>
                            {slot}
                          </Text>
                        </View>
                      </View>
                    );
                  }

                  // Assistant message — show text only, skip interactive widgets
                  if (role === 'assistant' && text) {
                    return (
                      <View key={`ps-${idx}`} style={[styles.assistantBubble, { opacity: 0.85 }]}>
                        <MessageText text={text} color={colors.grey900} />
                      </View>
                    );
                  }

                  // Regular user message
                  if (role === 'user' && text) {
                    return (
                      <View key={`ps-${idx}`} style={[styles.userBubble, { opacity: 0.85 }]}>
                        <MessageText text={text} color={colors.white} />
                      </View>
                    );
                  }

                  // Skip tool-only assistant messages with no text
                  const hasVisibleTool = toolParts.some((p: any) => {
                    const tn = p.toolName ?? (p.type ?? '').replace('tool-', '');
                    return tn === 'bookAppointment';
                  });
                  if (role === 'assistant' && hasVisibleTool) {
                    for (const part of toolParts) {
                      const tn = part.toolName ?? (part.type ?? '').replace('tool-', '');
                      if (tn === 'bookAppointment') {
                        const output = part.output ?? part.result;
                        if (output?.success && output?.starts_at) {
                          return (
                            <View key={`ps-${idx}`} style={[styles.assistantBubble, { opacity: 0.85 }]}>
                              {output.meeting_url && (
                                <AddToCalendarButton
                                  startsAt={output.starts_at}
                                  meetingUrl={output.meeting_url}
                                  hospitalName={output.hospital_name ?? 'Hospital'}
                                />
                              )}
                              {Platform.OS === 'ios' && (
                                <AddToAppleCalendarButton
                                  startsAt={output.starts_at}
                                  meetingUrl={output.meeting_url ?? null}
                                  hospitalName={output.hospital_name ?? 'Hospital'}
                                />
                              )}
                            </View>
                          );
                        }
                      }
                    }
                  }

                  return null;
                })}

                {/* Exit past-session mode — becomes a live session */}
                <TouchableOpacity
                  onPress={() => { resumePreviousSession(); handleClosePastSession(); }}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    backgroundColor: colors.purple,
                    borderRadius: 12,
                    paddingVertical: 12,
                    marginTop: 8,
                    marginBottom: 4,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Continue conversation</Text>
                  <MaterialIcons name="arrow-forward" size={15} color="#fff" />
                </TouchableOpacity>
              </>
            )}

            {/* ── Current session messages ───────────────────────────────── */}
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
                (p.toolInvocation?.toolName ?? p.toolName ?? (p.type ?? '').replace('tool-', '')) === 'searchHospitals'
              );
              const hasHospitalCards = searchHospitalsCalled && toolParts.some((part: any) => {
                const invocation = part.toolInvocation;
                const toolName = invocation?.toolName ?? part.toolName ?? (part.type ?? '').replace('tool-', '');
                const invState = part.state ?? invocation?.state ?? '';
                if (toolName !== 'searchHospitals') return false;
                if (invState !== 'output-available' && invState !== 'result' && !part.output && !part.result) return false;
                const hospitals =
                  part.output?.hospitals ?? part.result?.hospitals ??
                  invocation?.result?.hospitals ?? invocation?.output?.hospitals ??
                  (Array.isArray(part.output) ? part.output : null) ??
                  (Array.isArray(part.result) ? part.result : null);
                return Array.isArray(hospitals) && hospitals.length > 0;
              });

              // Suppress slot list in streaming text as soon as getHospitalBookingInfo is called.
              const slotPickerCalled = toolParts.some((p: any) =>
                (p.toolInvocation?.toolName ?? p.toolName ?? (p.type ?? '').replace('tool-', '')) === 'getHospitalBookingInfo'
              );
              const hasSlotPicker = slotPickerCalled && toolParts.some((part: any) => {
                const invocation = part.toolInvocation;
                const toolName = invocation?.toolName ?? part.toolName ?? (part.type ?? '').replace('tool-', '');
                const invState = part.state ?? invocation?.state ?? '';
                if (toolName !== 'getHospitalBookingInfo') return false;
                if (invState !== 'output-available' && invState !== 'result' && !part.output && !part.result) return false;
                const output = part.output ?? part.result ?? invocation?.result ?? invocation?.output;
                return output?.type === 'onboarded' && Array.isArray(output?.available_slots) && output.available_slots.length > 0;
              });

              const bookAppointmentCalled = toolParts.some((p: any) =>
                (p.toolInvocation?.toolName ?? p.toolName ?? (p.type ?? '').replace('tool-', '')) === 'bookAppointment'
              );
              const hasCalendarButton = bookAppointmentCalled && toolParts.some((part: any) => {
                const invocation = part.toolInvocation;
                const toolName = invocation?.toolName ?? part.toolName ?? (part.type ?? '').replace('tool-', '');
                const invState = part.state ?? invocation?.state ?? '';
                if (toolName !== 'bookAppointment') return false;
                if (invState !== 'output-available' && invState !== 'result' && !part.output && !part.result) return false;
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
              let calendarData: { startsAt: string; meetingUrl: string | null; hospitalName: string } | null = null;
              if (hasCalendarButton) {
                for (const part of toolParts) {
                  const inv = part.toolInvocation;
                  const tn = inv?.toolName ?? part.toolName ?? (part.type ?? '').replace('tool-', '');
                  if (tn !== 'bookAppointment') continue;
                  const output = part.output ?? part.result ?? inv?.result ?? inv?.output;
                  if (output?.success && output?.starts_at) {
                    calendarData = { startsAt: output.starts_at, meetingUrl: output.meeting_url ?? null, hospitalName: output.hospital_name ?? 'Hospital' };
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
                      {calendarData && calendarData.meetingUrl && (
                        <AddToCalendarButton
                          startsAt={calendarData.startsAt}
                          meetingUrl={calendarData.meetingUrl}
                          hospitalName={calendarData.hospitalName}
                        />
                      )}
                      {calendarData && Platform.OS === 'ios' && (
                        <AddToAppleCalendarButton
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
                    const toolName = invocation?.toolName ?? part.toolName ?? partType.replace('tool-', '');
                    const invState = part.state ?? invocation?.state ?? '';
                    const isHospitalResult =
                      toolName === 'searchHospitals' &&
                      (invState === 'output-available' || invState === 'result' || !!part.output || !!part.result);

                    if (isHospitalResult) {
                      // Never render cards until the prompt text has arrived
                      if (!displayText) return null;
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
                      (invState === 'output-available' || invState === 'result' || !!part.output || !!part.result);

                    if (isSlotResult && idx >= lastSearchHospitalsIdx) {
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
                      (invState === 'output-available' || invState === 'result' || !!part.output || !!part.result);

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
                    { backgroundColor: (busy || isLoading || !apiBase) ? 'rgba(69, 0, 80, 0.35)' : 'rgba(69, 0, 80, 0.6)' },
                  ]}
                  onPress={() => handleSubmit()}
                  disabled={busy || isLoading || !apiBase}
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
