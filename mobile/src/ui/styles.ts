import { StyleSheet } from 'react-native';

// Ogwu Design System
// Minimal, clinical-clean with a confident purple accent
// Inspired by Linear, Stripe, Clerk — tools that feel serious and trustworthy

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

  error: '#EF4444',
  errorLight: '#FEF2F2',
};

export const font = {
  regular: { fontWeight: '400' as const },
  medium: { fontWeight: '500' as const },
  semibold: { fontWeight: '600' as const },
  bold: { fontWeight: '700' as const },
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
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
    backgroundColor: colors.white,
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
    borderWidth: 1.5,
    borderColor: colors.grey300,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.black,
    backgroundColor: colors.white,
    marginBottom: spacing.md,
  },
  inputFocused: {
    borderColor: colors.purple,
  },
  pickerContainer: {
    borderWidth: 1.5,
    borderColor: colors.grey300,
    borderRadius: radius.md,
    backgroundColor: colors.white,
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

  // ─── Buttons ────────────────────────────────────────────────────────────
  btnPrimary: {
    backgroundColor: colors.purple,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  btnPrimaryDisabled: {
    backgroundColor: colors.purpleMid,
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
    borderWidth: 1.5,
    borderColor: colors.grey300,
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
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.grey100,
  },

  // ─── Profile field row ───────────────────────────────────────────────────
  profileField: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey100,
  },
  profileFieldLast: {
    borderBottomWidth: 0,
  },

  // ─── Pill / badge ─────────────────────────────────────────────────────────
  pill: {
    backgroundColor: colors.purpleLight,
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
    backgroundColor: colors.grey100,
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.purpleDark,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  tabButtonText: {
    color: colors.purpleMid,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tabButtonTextActive: {
    color: colors.white,
  },
});