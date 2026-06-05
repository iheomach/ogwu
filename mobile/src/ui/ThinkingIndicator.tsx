import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

const DOT_SIZE = 9;
const DOT_COLOR = '#7b4dd9';
const GAP = 6;
// One full breathe cycle per dot
const CYCLE = 600;
// Stagger between dots
const STAGGER = 160;

function Dot({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: CYCLE / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: CYCLE / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <Animated.View
      style={{
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
        backgroundColor: DOT_COLOR,
        marginHorizontal: GAP / 2,
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

export function ThinkingIndicator() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
      <Dot delay={0} />
      <Dot delay={STAGGER} />
      <Dot delay={STAGGER * 2} />
    </View>
  );
}
