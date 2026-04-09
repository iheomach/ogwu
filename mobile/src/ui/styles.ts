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

  // ─── Bottom tabs ───────────────────────────────────────────────────────
  tabBarSafeArea: {
    backgroundColor: colors.purpleDark,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 6,
    paddingBottom: 6,
    backgroundColor: colors.purpleDark,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 6,
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
});
