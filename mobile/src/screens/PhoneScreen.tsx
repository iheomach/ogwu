import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import type { PhoneScreenProps } from '../types';
import { colors, glassSurface, spacing, styles } from '../ui/styles';
import { t } from '../i18n';

// ── Country data ──────────────────────────────────────────────────────────────

type Country = { flag: string; name: string; dial: string };

const COUNTRIES: Country[] = [
  { flag: '🇺🇸', name: 'United States',    dial: '+1'   },
  { flag: '🇬🇧', name: 'United Kingdom',    dial: '+44'  },
  { flag: '🇨🇦', name: 'Canada',            dial: '+1'   },
  { flag: '🇦🇺', name: 'Australia',         dial: '+61'  },
  { flag: '🇳🇬', name: 'Nigeria',           dial: '+234' },
  { flag: '🇬🇭', name: 'Ghana',             dial: '+233' },
  { flag: '🇿🇦', name: 'South Africa',      dial: '+27'  },
  { flag: '🇰🇪', name: 'Kenya',             dial: '+254' },
  { flag: '🇪🇹', name: 'Ethiopia',          dial: '+251' },
  { flag: '🇹🇿', name: 'Tanzania',          dial: '+255' },
  { flag: '🇺🇬', name: 'Uganda',            dial: '+256' },
  { flag: '🇷🇼', name: 'Rwanda',            dial: '+250' },
  { flag: '🇸🇳', name: 'Senegal',           dial: '+221' },
  { flag: '🇨🇮', name: "Côte d'Ivoire",     dial: '+225' },
  { flag: '🇨🇲', name: 'Cameroon',          dial: '+237' },
  { flag: '🇮🇳', name: 'India',             dial: '+91'  },
  { flag: '🇵🇰', name: 'Pakistan',          dial: '+92'  },
  { flag: '🇧🇩', name: 'Bangladesh',        dial: '+880' },
  { flag: '🇨🇳', name: 'China',             dial: '+86'  },
  { flag: '🇯🇵', name: 'Japan',             dial: '+81'  },
  { flag: '🇰🇷', name: 'South Korea',       dial: '+82'  },
  { flag: '🇵🇭', name: 'Philippines',       dial: '+63'  },
  { flag: '🇮🇩', name: 'Indonesia',         dial: '+62'  },
  { flag: '🇲🇾', name: 'Malaysia',          dial: '+60'  },
  { flag: '🇸🇬', name: 'Singapore',         dial: '+65'  },
  { flag: '🇻🇳', name: 'Vietnam',           dial: '+84'  },
  { flag: '🇹🇭', name: 'Thailand',          dial: '+66'  },
  { flag: '🇩🇪', name: 'Germany',           dial: '+49'  },
  { flag: '🇫🇷', name: 'France',            dial: '+33'  },
  { flag: '🇮🇹', name: 'Italy',             dial: '+39'  },
  { flag: '🇪🇸', name: 'Spain',             dial: '+34'  },
  { flag: '🇵🇹', name: 'Portugal',          dial: '+351' },
  { flag: '🇳🇱', name: 'Netherlands',       dial: '+31'  },
  { flag: '🇧🇪', name: 'Belgium',           dial: '+32'  },
  { flag: '🇨🇭', name: 'Switzerland',       dial: '+41'  },
  { flag: '🇦🇹', name: 'Austria',           dial: '+43'  },
  { flag: '🇸🇪', name: 'Sweden',            dial: '+46'  },
  { flag: '🇳🇴', name: 'Norway',            dial: '+47'  },
  { flag: '🇩🇰', name: 'Denmark',           dial: '+45'  },
  { flag: '🇵🇱', name: 'Poland',            dial: '+48'  },
  { flag: '🇷🇺', name: 'Russia',            dial: '+7'   },
  { flag: '🇹🇷', name: 'Turkey',            dial: '+90'  },
  { flag: '🇸🇦', name: 'Saudi Arabia',      dial: '+966' },
  { flag: '🇦🇪', name: 'UAE',               dial: '+971' },
  { flag: '🇮🇱', name: 'Israel',            dial: '+972' },
  { flag: '🇪🇬', name: 'Egypt',             dial: '+20'  },
  { flag: '🇲🇦', name: 'Morocco',           dial: '+212' },
  { flag: '🇧🇷', name: 'Brazil',            dial: '+55'  },
  { flag: '🇲🇽', name: 'Mexico',            dial: '+52'  },
  { flag: '🇦🇷', name: 'Argentina',         dial: '+54'  },
  { flag: '🇨🇴', name: 'Colombia',          dial: '+57'  },
  { flag: '🇨🇱', name: 'Chile',             dial: '+56'  },
  { flag: '🇵🇪', name: 'Peru',              dial: '+51'  },
  { flag: '🇳🇿', name: 'New Zealand',       dial: '+64'  },
  { flag: '🇮🇪', name: 'Ireland',           dial: '+353' },
];

function parsePhone(phone: string): { country: Country; local: string } {
  if (!phone.startsWith('+')) return { country: COUNTRIES[0], local: phone };
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (phone.startsWith(c.dial)) return { country: c, local: phone.slice(c.dial.length) };
  }
  return { country: COUNTRIES[0], local: phone };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PhoneScreen({ busy, phone, setPhone, onSendOtp }: PhoneScreenProps) {
  const parsed = parsePhone(phone);
  const [country, setCountry] = useState<Country>(parsed.country);
  const [localNumber, setLocalNumber] = useState(parsed.local);
  const [focused, setFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q),
    );
  }, [search]);

  const handleLocalChange = (val: string) => {
    setLocalNumber(val);
    setPhone(country.dial + val);
  };

  const handleCountrySelect = (c: Country) => {
    setCountry(c);
    setPhone(c.dial + localNumber);
    setPickerOpen(false);
    setSearch('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Heading */}
          <Text style={styles.title}>{t('phone.title')}</Text>
          <Text style={styles.helper}>{t('phone.helper')}</Text>

          {/* Input row */}
          <Text style={styles.inputLabel}>{t('phone.label')}</Text>
          <View style={[s.inputRow, focused && s.inputRowFocused]}>

            {/* Country picker trigger */}
            <TouchableOpacity
              style={s.dialBtn}
              onPress={() => setPickerOpen(true)}
              disabled={busy}
              activeOpacity={0.7}
            >
              <Text style={s.flag}>{country.flag}</Text>
              <Text style={s.dialCode}>{country.dial}</Text>
              <MaterialIcons name="arrow-drop-down" size={16} color={colors.grey500} />
            </TouchableOpacity>

            <View style={s.divider} />

            {/* Local number input */}
            <TextInput
              value={localNumber}
              onChangeText={handleLocalChange}
              placeholder="000 000 0000"
              placeholderTextColor={colors.grey300}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="number-pad"
              style={s.numberInput}
              editable={!busy}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
          </View>

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

      {/* ── Country picker modal ───────────────────────────────────────────── */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => { setPickerOpen(false); setSearch(''); }}
      >
        <TouchableOpacity
          style={s.overlay}
          activeOpacity={1}
          onPress={() => { setPickerOpen(false); setSearch(''); }}
        />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Select country</Text>

          {/* Search */}
          <View style={s.searchRow}>
            <MaterialIcons name="search" size={18} color={colors.grey500} style={{ marginRight: 8 }} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search"
              placeholderTextColor={colors.grey300}
              style={s.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item, i) => `${item.dial}-${item.name}-${i}`}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const selected = item.name === country.name && item.dial === country.dial;
              return (
                <TouchableOpacity
                  style={[s.countryRow, selected && s.countryRowSelected]}
                  onPress={() => handleCountrySelect(item)}
                  activeOpacity={0.7}
                >
                  <Text style={s.countryFlag}>{item.flag}</Text>
                  <Text style={[s.countryName, selected && { color: colors.purpleGlow }]}>
                    {item.name}
                  </Text>
                  <Text style={s.countryDial}>{item.dial}</Text>
                  {selected && (
                    <MaterialIcons name="check" size={16} color={colors.purple} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // ─── Input row ───────────────────────────────────────────────────────────
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    borderRadius: 14,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  inputRowFocused: {
    borderColor: 'rgba(255,255,255,0.50)',
    borderWidth: 1.5,
  },
  dialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 13,
    gap: 4,
  },
  flag: {
    fontSize: 20,
    lineHeight: 24,
  },
  dialCode: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
    minWidth: 34,
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  numberInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.white,
  },

  // ─── Modal overlay ────────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.60)',
  },

  // ─── Bottom sheet ─────────────────────────────────────────────────────────
  sheet: {
    backgroundColor: '#0f0620',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    maxHeight: '75%',
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },

  // ─── Search ───────────────────────────────────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.white,
  },

  // ─── Country row ──────────────────────────────────────────────────────────
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  countryRowSelected: {
    backgroundColor: 'rgba(123,77,217,0.12)',
  },
  countryFlag: {
    fontSize: 22,
    lineHeight: 26,
    width: 30,
  },
  countryName: {
    flex: 1,
    fontSize: 15,
    color: colors.grey900,
    fontWeight: '500',
  },
  countryDial: {
    fontSize: 14,
    color: colors.grey500,
    fontWeight: '500',
    minWidth: 40,
    textAlign: 'right',
  },
});
