import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import type { RecordsScreenProps } from '../types';
import { fetchReport, buildReportText } from '../lib/report';
import { styles, colors, spacing } from '../ui/styles';
import { t } from '../i18n';

export function RecordsScreen({ busy, onOpenThread: _onOpenThread }: RecordsScreenProps) {
  const [exportLoading, setExportLoading] = useState(false);

  const handleExport = async () => {
    if (exportLoading) return;
    try {
      setExportLoading(true);
      const data = await fetchReport();
      const message = buildReportText(data);
      await Share.share({ message, title: t('records.exportTitle') });
    } catch (e: any) {
      Alert.alert(t('records.exportErrorTitle'), e?.message ?? t('records.exportErrorBody'));
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { justifyContent: 'flex-start', opacity: busy ? 0.7 : 1 }]}
      >
        <Text style={styles.title}>{t('records.title')}</Text>
        <Text style={styles.helper}>{t('records.helper')}</Text>

        <TouchableOpacity
          style={[styles.btnPrimary, (busy || exportLoading) ? styles.btnPrimaryDisabled : null, { marginBottom: 24 }]}
          onPress={handleExport}
          disabled={busy || exportLoading}
        >
          {exportLoading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnPrimaryText}>{t('records.exportReport')}</Text>
          }
        </TouchableOpacity>

        {/* ── OgwuAI Document Upload ── */}
        <Text style={[styles.label, { marginBottom: 12 }]}>AI Document Analysis</Text>

        <View style={{
          backgroundColor: colors.white,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: 'rgba(69,0,80,0.10)',
          borderStyle: 'dashed',
          padding: spacing.lg,
          alignItems: 'center',
        }}>
          <View style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: 'rgba(69,0,80,0.07)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
          }}>
            <MaterialIcons name="upload-file" size={26} color={colors.purple} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.grey900, marginBottom: 6, textAlign: 'center' }}>
            OgwuAI Document Upload
          </Text>
          <Text style={{ fontSize: 13, color: colors.grey500, textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
            Upload lab results, prescriptions, or imaging reports. OgwuAI will analyse them and make them available to both you and your care team.
          </Text>
          <View style={[styles.btnPrimary, styles.btnPrimaryDisabled, { width: '100%' }]}>
            <Text style={styles.btnPrimaryText}>Upload document — coming soon</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
