import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function OgwuLogo({ size = 40 }: { size?: number }) {
  const radius = size * 0.22;
  const circleSize = size * 0.70;

  return (
    <LinearGradient
      colors={['#2a0032', '#6b0080']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{
        width: circleSize,
        height: circleSize,
        borderRadius: circleSize / 2,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Text style={{
          color: '#450050',
          fontSize: size * 0.18,
          fontWeight: '700',
          letterSpacing: -0.5,
          fontFamily: 'System',
        }}>
          ogwu
        </Text>
      </View>
    </LinearGradient>
  );
}
