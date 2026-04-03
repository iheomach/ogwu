import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RecordsScreenProps } from '../types';
import { styles } from '../ui/styles';
import { t } from '../i18n';

export function RecordsScreen({ busy }: RecordsScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { justifyContent: 'flex-start', opacity: busy ? 0.7 : 1 }]}
      >
        <View style={[styles.brandRow, { marginBottom: 16 }]}>
          <View style={styles.brandDot} />
          <Text style={styles.brandName}>{t('common.appName')}</Text>
        </View>

        <Text style={styles.title}>{t('records.title')}</Text>
        <Text style={styles.helper}>{t('records.helper')}</Text>

        <View style={styles.card}>
          <Text style={styles.value}>{t('records.emptyTitle')}</Text>
          <Text style={[styles.helper, { marginBottom: 0 }]}>{t('records.emptyBody')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
