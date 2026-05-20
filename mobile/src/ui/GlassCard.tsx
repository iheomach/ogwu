import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';

export function GlassCard({
  children,
  style,
  innerStyle,
  intensity = 55,
  borderRadius = 20,
  onLayout,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  innerStyle?: ViewStyle;
  intensity?: number;
  borderRadius?: number;
  onLayout?: (e: any) => void;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  return (
    <View style={[styles.shadow, { borderRadius }, style]} onLayout={onLayout}>
      <BlurView
        intensity={intensity}
        tint="dark"
        style={{ borderRadius, overflow: 'hidden' as const }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize({ w: width, h: height });
        }}
      >
        {/* White gradient overlay — brighter at top, fades out */}
        <LinearGradient
          colors={['rgba(255,255,255,0.195)', 'rgba(255,255,255,0.025)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Top specular highlight */}
        <View style={[styles.topHighlight, { borderTopLeftRadius: borderRadius, borderTopRightRadius: borderRadius }]} />
        {/* Bottom edge */}
        <View style={[styles.bottomHighlight, { borderBottomLeftRadius: borderRadius, borderBottomRightRadius: borderRadius }]} />
        {/* Gradient border — matches tile tint: bright top, fades to near-invisible bottom */}
        {size && (
          <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFillObject}>
            <Defs>
              <SvgGradient id="b" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0"   stopColor="#ffffff" stopOpacity="0.45" />
                <Stop offset="1"   stopColor="#ffffff" stopOpacity="0.06" />
              </SvgGradient>
            </Defs>
            <Rect
              x={0.5} y={0.5}
              width={size.w - 1} height={size.h - 1}
              rx={borderRadius - 0.5} ry={borderRadius - 0.5}
              fill="none"
              stroke="url(#b)"
              strokeWidth={1}
            />
          </Svg>
        )}
        {/* Content */}
        <View style={innerStyle}>{children}</View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#0a0519',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 32,
    elevation: 8,
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.70)',
  },
  bottomHighlight: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
});
