import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppRouter } from './src/AppRouter';

export default function App() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        <AppRouter />
        <StatusBar style="auto" />
      </View>
    </SafeAreaProvider>
  );
}
