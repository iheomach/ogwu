import { Image } from 'react-native';

export function OgwuLogo({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/ogwu-mark.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
