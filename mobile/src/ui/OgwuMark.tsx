import { Image, View } from 'react-native';

export function OgwuMark({ size = 40 }: { size?: number }) {
  // The logo has a transparent cross cutout that needs a white backing on dark surfaces.
  // A white circle (slightly inset) sits behind the purple speech bubble so the
  // transparent cross area reads as white regardless of background color.
  const inset = Math.round(size * 0.12);
  const circleSize = size - inset * 2;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          top: inset,
          left: inset,
          width: circleSize,
          height: circleSize,
          backgroundColor: '#ffffff',
          borderRadius: circleSize / 2,
        }}
      />
      <Image
        source={require('../../assets/ogwu-mark.png')}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}
