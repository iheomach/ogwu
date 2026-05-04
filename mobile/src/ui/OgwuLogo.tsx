import { Image } from 'react-native';

export function OgwuLogo({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/ogwu-ios.png')}
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
      resizeMode="contain"
    />
  );
}
