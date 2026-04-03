import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, styles } from './styles';
import { t } from '../i18n';

export type TabKey = 'home' | 'newConsult' | 'records' | 'profile';

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.tabButton}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
    >
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function TabScaffold({
  activeTab,
  onNavigate,
  children,
}: {
  activeTab: TabKey;
  onNavigate: (tab: TabKey) => void;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flex: 1 }}>{children}</View>

      <SafeAreaView edges={['bottom']} style={styles.tabBarSafeArea}>
        <View style={styles.tabBar}>
          <TabButton
            label={t('tabs.home')}
            active={activeTab === 'home'}
            onPress={() => onNavigate('home')}
          />
          <TabButton
            label={t('tabs.newConsult')}
            active={activeTab === 'newConsult'}
            onPress={() => onNavigate('newConsult')}
          />
          <TabButton
            label={t('tabs.records')}
            active={activeTab === 'records'}
            onPress={() => onNavigate('records')}
          />
          <TabButton
            label={t('tabs.profile')}
            active={activeTab === 'profile'}
            onPress={() => onNavigate('profile')}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
