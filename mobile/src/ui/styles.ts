import { StyleSheet } from 'react-native';

// Ogwu Design System
// Liquid-glass aesthetic: translucent surfaces, soft purple depth, pill shapes
// Inspired by Apple's glass UI — serious, clinical, and alive

export const colors = {
  purple: '#450050',
  purpleLight: '#F0EBF1',
  purpleMid: '#DED1E0',
  purpleDark: '#450050',

  black: '#0A0A0A',
  grey900: '#111111',
  grey700: '#374151',
  grey500: '#6B7280',
  grey300: '#D1D5DB',
  grey100: '#F5F5F5',
  white: '#FFFFFF',

  // Screen background — barely-there lavender
  bg: '#FAF7FB',

  error: '#EF4444',
  errorLight: 'rgba(239, 68, 68, 0.07)',

  warning: '#F59E0B',
  warningLight: 'rgba(245, 158, 11, 0.07)',

  urgent: '#F97316',
  urgentLight: 'rgba(249, 115, 22, 0.07)',

  success: '#16A34A',
  successLight: 'rgba(22, 163, 74, 0.07)',
};

// Glass tokens — reused across cards, inputs, dropdowns
const glass = {
  backgroundColor: 'rgba(255, 255, 255, 0.72)',
  borderWidth: 1,
  borderColor: 'rgba(69, 0, 80, 0.11)',
  shadowColor: '#450050',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.07,
  shadowRadius: 14,
  elevation: 3,
};

export const font = {
  regular: { fontWeight: '400' as const },
  medium: { fontWeight: '500' as const },
  semibold: { fontWeight: '600' as const },
  bold: { fontWeight: '700' as const },
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const styles = StyleSheet.create({
  // ─── Layout ────────────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
    color: colors.black,
    letterSpacing: -0.5,
    marginBottom: spacing.sm,
  },
  h2: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.black,
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
    color: colors.black,
    marginBottom: spacing.md,
  },
  inputFocused: {
    borderColor: colors.purple,
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
    backgroundColor: 'rgba(69, 0, 80, 0.07)',
  },
  dropdownItemText: {
    fontSize: 15,
    color: colors.grey900,
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    color: colors.purple,
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
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 5,
  },
  btnPrimaryDisabled: {
    backgroundColor: colors.purpleMid,
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
    borderColor: 'rgba(239, 68, 68, 0.25)',
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
    borderRadius: radius.lg,
    padding: spacing.lg,
  },

  // ─── Profile field row ───────────────────────────────────────────────────
  profileField: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(69, 0, 80, 0.08)',
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
    backgroundColor: 'rgba(69, 0, 80, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(69, 0, 80, 0.14)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  pillText: {
    color: colors.purple,
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
    backgroundColor: 'rgba(69, 0, 80, 0.08)',
    marginVertical: spacing.lg,
  },
  mt8: { marginTop: spacing.sm },
  mt16: { marginTop: spacing.md },
  mt24: { marginTop: spacing.lg },

  // ─── Boot splash ────────────────────────────────────────────────────────
  bootSplashLogo: {
    width: 72,
    height: 72,
    borderRadius: 16,
    marginBottom: 24,
  },

  // ─── Home — hero header ──────────────────────────────────────────────────
  heroHeader: {
    backgroundColor: colors.purple,
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroGreeting: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500' as const,
  },
  heroName: {
    fontSize: 26,
    fontWeight: '800' as const,
    color: colors.white,
    marginTop: 2,
    letterSpacing: -0.5,
  },
  heroTagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 6,
    lineHeight: 19,
  },

  // ─── Home — section label ────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: colors.grey500,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },

  // ─── Home — quick action cards ───────────────────────────────────────────
  quickActionsRow: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  quickActionCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(69,0,80,0.08)',
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
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
    color: colors.grey900,
  },
  quickActionSubtitle: {
    fontSize: 11,
    color: colors.grey500,
    marginTop: 2,
  },

  // ─── Home — health status card ───────────────────────────────────────────
  healthStatusCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(69,0,80,0.07)',
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
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
    opacity: 0.8,
    marginTop: 1,
  },

  // ─── Home — symptom tags ─────────────────────────────────────────────────
  symptomTagsLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: colors.grey500,
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
    backgroundColor: 'rgba(69,0,80,0.05)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  symptomTagText: {
    fontSize: 12,
    color: colors.purple,
    fontWeight: '600' as const,
  },
  thinDivider: {
    height: 1,
    backgroundColor: 'rgba(69,0,80,0.06)',
  },

  // ─── Home — no-intake empty card ─────────────────────────────────────────
  noIntakeCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: 'rgba(69,0,80,0.1)',
    borderStyle: 'dashed' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 24,
  },
  noIntakeIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(69,0,80,0.06)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  noIntakeTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: colors.grey900,
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
    color: colors.purple,
    fontWeight: '700' as const,
  },

  // ─── Home — impact card ──────────────────────────────────────────────────
  impactCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(69,0,80,0.07)',
    overflow: 'hidden' as const,
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  impactItem: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
    padding: spacing.md,
  },
  impactItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(69,0,80,0.05)',
  },
  impactItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(69,0,80,0.07)',
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
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },

  // ─── Assistant — toolbar ──────────────────────────────────────────────────
  assistantToolbar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(69, 0, 80, 0.06)',
  },
  assistantToolbarTitle: {
    color: colors.grey900,
    fontWeight: '700' as const,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  toolbarIconBtn: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: 'rgba(69,0,80,0.07)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // ─── Assistant — last session recap card ──────────────────────────────────
  lastSessionCard: {
    backgroundColor: '#F4EFF5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(69,0,80,0.09)',
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
    color: colors.purple,
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
    color: '#fff',
    fontSize: 13,
    fontWeight: '600' as const,
  },
  newChatButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  newChatButtonText: {
    color: colors.purple,
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
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(66,133,244,0.3)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: spacing.sm,
    shadowColor: '#4285F4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
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
    backgroundColor: colors.white,
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
    color: '#1a1a1a',
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
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  appleCalLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#1a1a1a',
  },
  appleCalSubtitle: {
    fontSize: 11,
    color: colors.grey500,
    marginTop: 1,
  },

  // ─── Assistant — slot picker ──────────────────────────────────────────────
  slotPickerContainer: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(69,0,80,0.1)',
    overflow: 'hidden' as const,
    marginBottom: spacing.sm,
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
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
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: 12,
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  hospitalCardHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
  },
  hospitalCardName: {
    fontWeight: '700' as const,
    fontSize: 14,
    color: colors.grey900,
    flex: 1,
    marginRight: 8,
  },
  hospitalCardDistance: {
    fontSize: 12,
    color: colors.purple,
    fontWeight: '600' as const,
  },
  hospitalCardLocation: {
    fontSize: 12,
    color: colors.grey500,
    marginTop: 3,
  },
  hospitalCardBadgesRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 8,
  },
  emergencyBadge: {
    backgroundColor: 'rgba(239,68,68,0.08)',
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
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bookOnlineBadgeText: {
    fontSize: 10,
    color: '#10b981',
    fontWeight: '600' as const,
  },
  callToBookBadge: {
    backgroundColor: 'rgba(107,114,128,0.08)',
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
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
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
    shadowOpacity: 0.3,
    shadowRadius: 16,
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
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderRadius: 999,
    overflow: 'hidden' as const,
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
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
    color: colors.grey900,
    backgroundColor: 'transparent' as const,
  },
  chatSendButton: {
    width: 52,
    alignSelf: 'stretch' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // ─── Bottom tabs ───────────────────────────────────────────────────────
  tabBarSafeArea: {
    backgroundColor: colors.purpleDark,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: colors.purpleDark,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 4,
    alignItems: 'center',
  },
  tabButtonIcon: {
    marginBottom: 1,
  },
  tabButtonText: {
    color: colors.purpleMid,
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
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.purple,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: -18,
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  assistantFabInnerActive: {
    backgroundColor: '#6B0080',
  },
});
