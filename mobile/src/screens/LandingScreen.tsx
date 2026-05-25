import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, styles } from '../ui/styles';

const { width: W, height: H } = Dimensions.get('window');

// Ring centre — upper-right quadrant
const CX = W * 0.62;
const CY = H * 0.30;

const RINGS = [
  { size: 600, opacity: 0.07 },
  { size: 430, opacity: 0.11 },
  { size: 275, opacity: 0.16 },
];

const DOTS: Array<{ ring: number; angle: number; size: number; color: string; glow: boolean }> = [
  { ring: 0, angle: -Math.PI * 0.22, size: 14, color: colors.purple,              glow: true  },
  { ring: 1, angle:  Math.PI * 0.68, size:  6, color: 'rgba(184,160,245,0.70)',   glow: false },
  { ring: 2, angle:  Math.PI * 1.35, size:  5, color: 'rgba(255,255,255,0.30)',   glow: false },
];

export function LandingScreen({ onGetStarted }: { onGetStarted: () => void }) {
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 700, delay: 120, useNativeDriver: true }),
      Animated.spring(slide, { toValue: 0, speed: 9, bounciness: 3,   useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar style="light" />

      {/* ── Decorative rings ─────────────────────────────────────────────── */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        {RINGS.map(({ size, opacity }, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 1,
              borderColor: `rgba(255,255,255,${opacity})`,
              left: CX - size / 2,
              top:  CY - size / 2,
            }}
          />
        ))}

        {DOTS.map(({ ring, angle, size, color, glow }, i) => {
          const r = RINGS[ring].size / 2;
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: color,
                left: CX + r * Math.cos(angle) - size / 2,
                top:  CY + r * Math.sin(angle) - size / 2,
                ...(glow ? {
                  shadowColor: colors.purple,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 1,
                  shadowRadius: 18,
                  elevation: 8,
                } : {}),
              }}
            />
          );
        })}
      </View>

      {/* ── Logo row ─────────────────────────────────────────────────────── */}
      <Animated.View style={[s.logoRow, { opacity: fade }]}>
        <Image
          source={require('../../assets/ogwu-mark.png')}
          style={s.logoMark}
          resizeMode="contain"
        />
        <Text style={s.logoWord}>ogwu</Text>
      </Animated.View>

      {/* ── Spacer — pushes content to bottom ────────────────────────────── */}
      <View style={{ flex: 1 }} />

      {/* ── Bottom content ───────────────────────────────────────────────── */}
      <Animated.View style={[s.bottom, { opacity: fade, transform: [{ translateY: slide }] }]}>
        <Text style={s.headline}>{'Your health,\nin good hands.'}</Text>
        <Text style={s.sub}>
          Agentic AI that thinks, acts, and advocates for your health.
        </Text>

        <TouchableOpacity style={s.cta} onPress={onGetStarted} activeOpacity={0.87}>
          <Text style={s.ctaText}>Get started</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: 10,
  },
  logoMark: {
    width: 34,
    height: 34,
  },
  logoWord: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  bottom: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  headline: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1.2,
    lineHeight: 50,
    marginBottom: 14,
  },
  sub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.58)',
    lineHeight: 24,
    marginBottom: 30,
  },
  cta: {
    backgroundColor: colors.purple,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
