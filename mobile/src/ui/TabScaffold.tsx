import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { colors, styles } from './styles';
import { t } from '../i18n';

export type TabKey = 'home' | 'newConsult' | 'records' | 'profile';

type TabIconName = keyof typeof MaterialIcons.glyphMap;

function TabButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: TabIconName;
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
      <MaterialIcons
        name={icon}
        size={18}
        color={active ? colors.white : colors.purpleMid}
        style={styles.tabButtonIcon}
      />
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
            icon="home"
            active={activeTab === 'home'}
            onPress={() => onNavigate('home')}
          />
          <TabButton
            label={t('tabs.newConsult')}
            icon="add-circle-outline"
            active={activeTab === 'newConsult'}
            onPress={() => onNavigate('newConsult')}
          />
          <TabButton
            label={t('tabs.records')}
            icon="description"
            active={activeTab === 'records'}
            onPress={() => onNavigate('records')}
          />
          <TabButton
            label={t('tabs.profile')}
            icon="person"
            active={activeTab === 'profile'}
            onPress={() => onNavigate('profile')}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
