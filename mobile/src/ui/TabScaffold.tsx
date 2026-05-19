import { Image, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { colors, styles } from './styles';
import { t } from '../i18n';

export type TabKey = 'home' | 'newConsult' | 'records' | 'inbox' | 'profile';

type TabIconName = keyof typeof MaterialIcons.glyphMap;

function TabButton({
  label,
  icon,
  active,
  onPress,
  badge = 0,
}: {
  label: string;
  icon: TabIconName;
  active: boolean;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <TouchableOpacity
      style={styles.tabButton}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
    >
      <View style={{ position: 'relative' }}>
        <MaterialIcons
          name={icon}
          size={18}
          color={active ? colors.white : 'rgba(184,160,245,0.55)'}
          style={styles.tabButtonIcon}
        />
        {badge > 0 && (
          <View style={sheet.badge}>
            <Text style={sheet.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const sheet = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    minWidth: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700' as const,
  },
});

function AssistantFab({ active, onPress }: { active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.assistantFab}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="OgwuAI"
    >
      <Image
        source={require('../../assets/ogwu-mark.png')}
        style={{ width: 46, height: 46, marginTop: -14, opacity: active ? 1 : 0.85 }}
        resizeMode="contain"
      />
    </TouchableOpacity>
  );
}

export function TabScaffold({
  activeTab,
  onNavigate,
  children,
  locale: _locale,
  openThreadCount = 0,
}: {
  activeTab: TabKey;
  onNavigate: (tab: TabKey) => void;
  children: React.ReactNode;
  locale?: string;
  openThreadCount?: number;
}) {
  return (
    <View style={{ flex: 1 }}>
      {/* Content fills the full height; tab bar floats on top */}
      <View style={{ flex: 1 }}>{children}</View>

      <SafeAreaView
        edges={['bottom']}
        style={styles.tabBarSafeArea}
        pointerEvents="box-none"
      >
        <View style={styles.tabBar}>
          <TabButton
            label={t('tabs.home')}
            icon="home"
            active={activeTab === 'home'}
            onPress={() => onNavigate('home')}
          />
          <TabButton
            label={t('tabs.records')}
            icon="description"
            active={activeTab === 'records'}
            onPress={() => onNavigate('records')}
          />
          <AssistantFab
            active={activeTab === 'newConsult'}
            onPress={() => onNavigate('newConsult')}
          />
          <TabButton
            label="Inbox"
            icon="inbox"
            active={activeTab === 'inbox'}
            onPress={() => onNavigate('inbox')}
            badge={activeTab !== 'inbox' ? openThreadCount : 0}
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
