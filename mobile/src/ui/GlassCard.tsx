import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';

// Light tint samples the background and LIGHTENS it, so cards appear brighter
// than the purple gradient behind them — the effect the reference design has.
const TINT = Platform.OS === 'ios'
  ? ('systemUltraThinMaterialLight' as const)
  : ('light' as const);

export function GlassCard({
  children,
  style,
  innerStyle,
  intensity = 80,
  borderRadius = 20,
  borderColor = 'rgba(255,255,255,0.30)',
  onLayout,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  innerStyle?: ViewStyle;
  intensity?: number;
  borderRadius?: number;
  borderColor?: string;
  onLayout?: (e: any) => void;
}) {
  return (
    <View style={[styles.shadow, { borderRadius }, style]} onLayout={onLayout}>
      <BlurView intensity={intensity} tint={TINT} style={{ borderRadius, overflow: 'hidden' as const }}>
        {/* White tint overlay — adds frosted warmth on top of the blur */}
        <View style={[StyleSheet.absoluteFillObject, styles.tint]} />
        {/* Specular highlight — simulates light catching the top edge of glass */}
        <View style={[styles.highlight, { borderTopLeftRadius: borderRadius, borderTopRightRadius: borderRadius }]} />
        {/* Inset border */}
        <View style={[StyleSheet.absoluteFillObject, { borderRadius, borderWidth: 1, borderColor }]} />
        {/* Content */}
        <View style={innerStyle}>{children}</View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 8,
  },
  tint: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.60)',
  },
});
