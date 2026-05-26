import { StyleSheet } from 'react-native';

// Ogwu Design System — Liquid Glass Dark
// Palette: deep violet backdrop + translucent white glass surfaces
// Reference: #1a0a2e deep → #3d1670 mid → #7b4dd9 accent → #b8a0f5 glow

export const colors = {
  // ── Backdrop ───────────────────────────────────────────────────────────────
  bg:       '#080412',     // deepest background
  bgMid:    '#0f0620',     // mid-tone backdrop for gradients

  // ── Purple accent ─────────────────────────────────────────────────────────
  purple:     '#7b4dd9',              // vibrant CTAs and active states
  purpleGlow: '#b8a0f5',             // light purple for text accents
  purpleLight: 'rgba(123,77,217,0.30)', // disabled / muted
  purpleMid:   'rgba(184,160,245,0.40)', // inactive tab labels
  purpleDark:  '#080412',            // same as bg (compat alias)

  // ── Text (white spectrum on dark bg) ─────────────────────────────────────
  black:   'rgba(255,255,255,0.95)',
  grey900: 'rgba(255,255,255,0.93)',
  grey700: 'rgba(255,255,255,0.72)',
  grey500: 'rgba(255,255,255,0.48)',
  grey300: 'rgba(255,255,255,0.28)',
  grey100: 'rgba(255,255,255,0.07)',
  white:   '#FFFFFF',

  // ── Status colours (vivid, readable on dark) ─────────────────────────────
  error:        '#FF6B6B',
  errorLight:   'rgba(255,107,107,0.18)',
  warning:      '#FFB347',
  warningLight: 'rgba(255,179,71,0.18)',
  urgent:       '#FF8C42',
  urgentLight:  'rgba(255,140,66,0.18)',
  success:      '#4ADE80',
  successLight: 'rgba(74,222,128,0.18)',
};

// ── Glass surface token ────────────────────────────────────────────────────
// Approximates backdrop-blur glass in React Native (no blur, but tint+border)
const glass = {
  backgroundColor: 'rgba(255, 255, 255, 0.09)',
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.20)',
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.35,
  shadowRadius: 20,
  elevation: 6,
};

// ── Exported glass surface helpers ─────────────────────────────────────────
// Use these for inline styles in screens so all surfaces stay consistent.
export const glassSurface = {
  bg:         'rgba(255,255,255,0.09)',
  bgMid:      'rgba(255,255,255,0.14)',
  bgStrong:   'rgba(255,255,255,0.18)',
  border:     'rgba(255,255,255,0.20)',
  borderSoft: 'rgba(255,255,255,0.12)',
  divider:    'rgba(255,255,255,0.10)',
  highlight:  'rgba(255,255,255,0.18)', // top-edge specular
};

export const font = {
  regular:  { fontWeight: '400' as const },
  medium:   { fontWeight: '500' as const },
  semibold: { fontWeight: '600' as const },
  bold:     { fontWeight: '700' as const },
};

export const radius = {
  sm:   8,
  md:   14,
  lg:   20,
  xl:   28,
  full: 999,
};

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

// Extra bottom padding for screens under the floating tab bar
export const TAB_BAR_HEIGHT = 100;

export const styles = StyleSheet.create({
  // ─── Layout ────────────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },

  // ─── Brand mark ────────────────────────────────────────────────────────
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.purple,
    marginRight: spacing.sm,
  },
  brandName: {
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.purple,
    fontWeight: '600',
  },

  // ─── Typography ─────────────────────────────────────────────────────────
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: -0.5,
    marginBottom: spacing.sm,
  },
  h2: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: -0.3,
    marginBottom: spacing.xs,
  },
  helper: {
    fontSize: 14,
    color: colors.grey500,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.grey500,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  value: {
    fontSize: 16,
    color: colors.grey900,
    fontWeight: '500',
  },

  // ─── Input ──────────────────────────────────────────────────────────────
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.grey700,
    marginBottom: spacing.xs,
  },
  input: {
    ...glass,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.white,
    letterSpacing: 0,
    marginBottom: spacing.md,
  },
  inputFocused: {
    borderColor: 'rgba(255,255,255,0.50)',
    borderWidth: 1.5,
  },
  pickerContainer: {
    ...glass,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  picker: {
    width: '100%',
    color: colors.white,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 13,
  },

  // ─── Dropdown ──────────────────────────────────────────────────────────
  dropdownContainer: {
    marginBottom: spacing.md,
  },
  dropdownButton: {
    ...glass,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownButtonText: {
    fontSize: 16,
    color: colors.grey700,
    fontWeight: '500',
  },
  dropdownMenu: {
    marginTop: spacing.xs,
    ...glass,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(123,77,217,0.18)',
  },
  dropdownItemText: {
    fontSize: 15,
    color: colors.grey900,
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    color: colors.purpleGlow,
  },

  // ─── Buttons ────────────────────────────────────────────────────────────
  btnPrimary: {
    backgroundColor: colors.purple,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.sm,
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.40,
    shadowRadius: 14,
    elevation: 5,
  },
  btnPrimaryDisabled: {
    backgroundColor: 'rgba(123,77,217,0.30)',
    shadowOpacity: 0,
    elevation: 0,
  },
  btnPrimaryText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  btnGhost: {
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  btnGhostText: {
    color: colors.grey500,
    fontSize: 14,
    fontWeight: '500',
  },
  btnDestructive: {
    ...glass,
    borderColor: 'rgba(255,107,107,0.35)',
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  btnDestructiveText: {
    color: colors.error,
    fontSize: 15,
    fontWeight: '500',
  },

  // ─── Card / surface ──────────────────────────────────────────────────────
  card: {
    ...glass,
    borderRadius: 10,
    padding: spacing.lg,
  },

  // ─── Profile field row ───────────────────────────────────────────────────
  profileField: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: glassSurface.divider,
  },
  profileFieldLast: {
    borderBottomWidth: 0,
  },
  profileEditInput: {
    fontSize: 14,
    color: colors.grey900,
    paddingTop: 4,
    paddingBottom: 2,
    minHeight: 36,
  },

  // ─── Pill / badge ─────────────────────────────────────────────────────────
  pill: {
    backgroundColor: glassSurface.bgMid,
    borderWidth: 1,
    borderColor: glassSurface.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  pillText: {
    color: colors.purpleGlow,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // ─── Utility ────────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spacer: { flex: 1 },
  divider: {
    height: 1,
    backgroundColor: glassSurface.divider,
    marginVertical: spacing.lg,
  },
  mt8:  { marginTop: spacing.sm },
  mt16: { marginTop: spacing.md },
  mt24: { marginTop: spacing.lg },

  // ─── Boot splash ────────────────────────────────────────────────────────
  bootSplashLogo: {
    width: 80,
    height: 80,
    marginBottom: 24,
  },

  // ─── Home — hero header (glass card) ────────────────────────────────────
  heroHeader: {
    ...glass,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingTop: 22,
    paddingBottom: 24,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    overflow: 'hidden' as const,
  },
  heroGreeting: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.60)',
    fontWeight: '500' as const,
  },
  heroName: {
    fontSize: 30,
    fontWeight: '800' as const,
    color: colors.white,
    marginTop: 2,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(123,77,217,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  heroTagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.60)',
    marginTop: 6,
    lineHeight: 19,
  },

  // ─── Home — section label ────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },

  // ─── Home — quick action cards ───────────────────────────────────────────
  quickActionsRow: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  quickActionCard: {
    ...glass,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 10,
    padding: spacing.md,
    minHeight: 110,
    justifyContent: 'space-between' as const,
  },
  quickActionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 10,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: colors.white,
  },
  quickActionSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.52)',
    marginTop: 2,
  },

  // ─── Home — health status card ───────────────────────────────────────────
  healthStatusCard: {
    ...glass,
    borderRadius: 10,
    padding: spacing.md,
    gap: 14,
  },

  // ─── Home — urgency banner ───────────────────────────────────────────────
  urgencyBannerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderWidth: 1,
  },
  urgencyBannerLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  urgencyBannerSummary: {
    fontSize: 11,
    opacity: 0.85,
    marginTop: 1,
  },

  // ─── Home — symptom tags ─────────────────────────────────────────────────
  symptomTagsLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.48)',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  symptomTagsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  symptomTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    backgroundColor: glassSurface.bgMid,
    borderWidth: 1,
    borderColor: glassSurface.borderSoft,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  symptomTagText: {
    fontSize: 12,
    color: colors.purpleGlow,
    fontWeight: '600' as const,
  },
  thinDivider: {
    height: 1,
    backgroundColor: glassSurface.divider,
  },

  // ─── Tag input ───────────────────────────────────────────────────────────
  tagInputWrap: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 6,
  },
  tagChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: glassSurface.bgMid,
    borderWidth: 1,
    borderColor: glassSurface.border,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  tagChipText: {
    fontSize: 13,
    color: colors.purpleGlow,
    fontWeight: '600' as const,
  },
  tagAddRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 10,
    gap: 8,
  },
  tagAddInput: {
    flex: 1,
    fontSize: 13,
    color: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: glassSurface.border,
    paddingVertical: 4,
  },
  tagAddBtn: {
    backgroundColor: colors.purple,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  tagAddBtnText: {
    fontSize: 13,
    color: colors.white,
    fontWeight: '600' as const,
  },

  // ─── Home — no-intake empty card ─────────────────────────────────────────
  noIntakeCard: {
    ...glass,
    borderRadius: 10,
    padding: spacing.md,
    borderStyle: 'dashed' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 24,
  },
  noIntakeIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: glassSurface.bgMid,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  noIntakeTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: colors.white,
  },
  noIntakeBody: {
    fontSize: 12,
    color: colors.grey500,
    textAlign: 'center' as const,
  },
  noIntakeAction: {
    marginTop: 4,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  noIntakeLinkText: {
    fontSize: 12,
    color: colors.purpleGlow,
    fontWeight: '700' as const,
  },

  // ─── Home — impact card ──────────────────────────────────────────────────
  impactCard: {
    ...glass,
    borderRadius: 10,
    overflow: 'hidden' as const,
  },
  impactItem: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
    padding: spacing.md,
  },
  impactItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: glassSurface.divider,
  },
  impactItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: glassSurface.bgMid,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 1,
  },
  impactItemText: {
    flex: 1,
    fontSize: 13,
    color: colors.grey700,
    lineHeight: 20,
  },

  // ─── Assistant — chat bubbles ─────────────────────────────────────────────
  assistantBubble: {
    alignSelf: 'flex-start' as const,
    backgroundColor: glassSurface.bgMid,
    borderWidth: 1,
    borderColor: glassSurface.border,
    padding: spacing.md,
    borderRadius: 18,
    marginBottom: spacing.sm,
    maxWidth: '88%' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.20,
    shadowRadius: 8,
    elevation: 2,
  },
  userBubble: {
    alignSelf: 'flex-end' as const,
    backgroundColor: colors.purple,
    padding: spacing.md,
    borderRadius: 18,
    marginBottom: spacing.sm,
    maxWidth: '88%' as const,
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 4,
  },

  // ─── Assistant — toolbar ──────────────────────────────────────────────────
  assistantToolbar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderBottomWidth: 1,
    borderBottomColor: glassSurface.divider,
  },
  assistantToolbarTitle: {
    color: colors.white,
    fontWeight: '700' as const,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  toolbarIconBtn: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: glassSurface.bgMid,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // ─── Assistant — last session recap card ──────────────────────────────────
  lastSessionCard: {
    backgroundColor: glassSurface.bgMid,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: glassSurface.border,
  },
  lastSessionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    marginBottom: 10,
  },
  lastSessionLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: colors.purpleGlow,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.9,
  },
  lastSessionSummary: {
    fontSize: 14,
    color: colors.grey700,
    lineHeight: 21,
  },
  lastSessionContinueBtn: {
    marginTop: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: colors.purple,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignSelf: 'flex-start' as const,
  },
  lastSessionContinueBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  newChatButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  newChatButtonText: {
    color: colors.purpleGlow,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  toolStatusRow: {
    marginBottom: spacing.sm,
  },
  toolStatusText: {
    fontSize: 12,
    fontStyle: 'italic' as const,
  },

  // ─── Assistant — Google Calendar button ──────────────────────────────────
  gcalButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    ...glass,
    borderRadius: 12,
    borderColor: 'rgba(66,133,244,0.40)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: spacing.sm,
  },
  gcalIconOuter: {
    width: 28,
    height: 28,
    borderRadius: 6,
    overflow: 'hidden' as const,
    position: 'relative' as const,
  },
  gcalIconBorder: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: '#4285F4',
    borderRadius: 6,
  },
  gcalIconHeader: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: '#4285F4',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  gcalIconDateWrap: {
    position: 'absolute' as const,
    bottom: 3,
    alignSelf: 'center' as const,
  },
  gcalIconDateText: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: '#4285F4',
    lineHeight: 13,
  },
  gcalLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: colors.white,
  },
  gcalSubtitle: {
    fontSize: 11,
    color: colors.grey500,
    marginTop: 1,
  },

  appleCalButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    ...glass,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  appleCalLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: colors.white,
  },
  appleCalSubtitle: {
    fontSize: 11,
    color: colors.grey500,
    marginTop: 1,
  },

  // ─── Assistant — slot picker ──────────────────────────────────────────────
  slotPickerContainer: {
    ...glass,
    borderRadius: 16,
    overflow: 'hidden' as const,
    marginBottom: spacing.sm,
  },
  slotPickerHeader: {
    backgroundColor: colors.purple,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  slotPickerHospitalName: {
    color: colors.white,
    fontWeight: '700' as const,
    fontSize: 13,
  },
  slotPickerSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginTop: 2,
  },
  slotPickerSectionLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: colors.grey500,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.6,
  },
  slotConfirmBtnText: {
    color: colors.white,
    fontWeight: '700' as const,
    fontSize: 14,
  },

  // ─── Assistant — hospital card ────────────────────────────────────────────
  hospitalCard: {
    ...glass,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: 12,
  },
  hospitalCardHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
  },
  hospitalCardName: {
    fontWeight: '700' as const,
    fontSize: 14,
    color: colors.white,
    flex: 1,
    marginRight: 8,
  },
  hospitalCardDistance: {
    fontSize: 12,
    color: colors.purpleGlow,
    fontWeight: '600' as const,
  },
  hospitalCardLocation: {
    fontSize: 12,
    color: colors.grey500,
    marginTop: 3,
  },
  hospitalCardStandout: {
    fontSize: 12,
    color: colors.purpleGlow,
    fontStyle: 'italic' as const,
    marginTop: 5,
    lineHeight: 17,
  },
  hospitalCardBadgesRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 8,
  },
  emergencyBadge: {
    backgroundColor: colors.errorLight,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  emergencyBadgeText: {
    fontSize: 10,
    color: colors.error,
    fontWeight: '600' as const,
  },
  bookOnlineBadge: {
    backgroundColor: colors.successLight,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bookOnlineBadgeText: {
    fontSize: 10,
    color: colors.success,
    fontWeight: '600' as const,
  },
  callToBookBadge: {
    backgroundColor: glassSurface.bgMid,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  callToBookBadgeText: {
    fontSize: 10,
    color: colors.grey500,
    fontWeight: '600' as const,
  },

  // ─── Assistant — bottom bar ───────────────────────────────────────────────
  chatBottomBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },

  // ─── Assistant — end-conversation send button ────────────────────────────
  sendSummaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.purple,
    borderRadius: 999,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 4,
    gap: 8,
  },
  sendSummaryButtonText: {
    color: colors.white,
    fontWeight: '600' as const,
    fontSize: 15,
  },

  // ─── Assistant — chat input bar ───────────────────────────────────────────
  chatInputBar: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    backgroundColor: glassSurface.bgStrong,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: glassSurface.border,
    overflow: 'hidden' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 4,
  },
  chatTextInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.white,
    backgroundColor: 'transparent' as const,
  },
  chatSendButton: {
    width: 52,
    alignSelf: 'stretch' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // ─── Bottom tabs — floating glass pill ──────────────────────────────────
  tabBarSafeArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: spacing.sm,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: 'rgba(8,4,18,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  tabButton: {
    flex: 1,
    paddingBottom: 2,
    alignItems: 'center',
  },
  tabButtonIcon: {
    marginBottom: 1,
  },
  tabButtonText: {
    color: 'rgba(184,160,245,0.55)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tabButtonTextActive: {
    color: colors.white,
  },

  // ─── Assistant FAB (center nav button) ────────────────────────────────
  assistantFab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 2,
  },
  assistantFabInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.purple,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: -16,
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  assistantFabInnerActive: {
    backgroundColor: '#9b6dff',
  },
});
