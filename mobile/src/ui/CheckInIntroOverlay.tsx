import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './styles';

const LOGO_SIZE = 108;
const FAB_SIZE = 50;

// Tab bar geometry constants (must match styles.ts)
const TAB_MARGIN_BOTTOM = 10;
const TAB_PADDING_BOTTOM = 8;
const TAB_CONTENT_HEIGHT = 35; // icon + label
const FAB_LIFT = 16;           // assistantFabInner marginTop: -16

export function CheckInIntroOverlay({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Approximate Y of the FAB circle center from the top of the screen.
    // FAB sits above the tab bar: bottom edge of tab bar → climb up by half
    // the tab content height + the FAB's own lift offset.
    const tabBarBottom = insets.bottom + TAB_MARGIN_BOTTOM;
    const tabBarHeight = TAB_PADDING_BOTTOM + TAB_CONTENT_HEIGHT + 6; // +6 paddingTop
    const fabCenterY = H - tabBarBottom - tabBarHeight / 2 - FAB_LIFT;
    const screenCenterY = H / 2;
    const targetY = fabCenterY - screenCenterY;
    const targetScale = FAB_SIZE / LOGO_SIZE;

    const easing = Easing.bezier(0.4, 0, 0.2, 1);

    Animated.sequence([
      // Fade in at center
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
      // Fly down + shrink, fading out mid-flight
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: targetY,
          duration: 520,
          useNativeDriver: true,
          easing,
        }),
        Animated.timing(scale, {
          toValue: targetScale,
          duration: 520,
          useNativeDriver: true,
          easing,
        }),
        Animated.sequence([
          Animated.delay(180),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 340,
            useNativeDriver: true,
            easing: Easing.in(Easing.ease),
          }),
        ]),
      ]),
    ]).start(() => onDone());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <View style={sheet.center}>
        <Animated.View
          style={[sheet.circle, { opacity, transform: [{ translateY }, { scale }] }]}
        >
          <Image
            source={require('../../assets/ogwu-mark.png')}
            style={{ width: LOGO_SIZE * 0.72, height: LOGO_SIZE * 0.72 }}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    </View>
  );
}

const sheet = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.65,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
});
