import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import type { RecordsScreenProps } from '../types';
import { documentsList, documentsDelete, type DocumentRecord } from '../lib/documents';
import { fetchReport, shareReportAsPdf } from '../lib/report';
import { styles, colors, spacing, glassSurface, TAB_BAR_HEIGHT } from '../ui/styles';
import { ThinkingIndicator } from '../ui/ThinkingIndicator';
import { GlassCard } from '../ui/GlassCard';
import { t } from '../i18n';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function statusLabel(status: DocumentRecord['status']): string {
  switch (status) {
    case 'complete':   return 'Analysed';
    case 'failed':     return 'Failed';
    case 'embedding':  return 'Processing…';
    case 'extracting': return 'Extracting…';
    default:           return 'Pending…';
  }
}

function statusColor(status: DocumentRecord['status']): string {
  if (status === 'complete') return colors.success;
  if (status === 'failed')   return colors.error;
  return colors.grey500;
}

function DocRow({
  doc,
  onDelete,
  deleting,
}: {
  doc: DocumentRecord;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <GlassCard
        borderRadius={14}
        innerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}
      >
        <View style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: 'rgba(123,77,217,0.18)',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <MaterialIcons name="description" size={18} color={colors.purple} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.grey900 }} numberOfLines={1}>
            {doc.file_name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            {/* <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor(doc.status) }} />
            <Text style={{ fontSize: 12, color: statusColor(doc.status), fontWeight: '500' }}>
              {statusLabel(doc.status)}
            </Text> */}
            {/* <Text style={{ fontSize: 12, color: colors.grey500 }}>·</Text> */}
            <Text style={{ fontSize: 12, color: colors.grey500 }}>{formatDate(doc.created_at)}</Text>
          </View>
          {doc.status === 'failed' && doc.error ? (
            <Text style={{ fontSize: 11, color: colors.error, marginTop: 2 }} numberOfLines={1}>
              {doc.error}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={onDelete}
          disabled={deleting}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          {deleting
            ? <ActivityIndicator size="small" color={colors.error} />
            : <MaterialIcons name="delete-outline" size={20} color={colors.error} />
          }
        </TouchableOpacity>
      </GlassCard>
    </View>
  );
}

export function RecordsScreen({ busy, onUpload }: RecordsScreenProps) {
  const [exportLoading, setExportLoading] = useState(false);
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    try {
      setDocsLoading(true);
      const list = await documentsList();
      setDocs(list);
    } catch {
      // Non-fatal — list stays empty
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleDelete = (doc: DocumentRecord) => {
    Alert.alert(
      'Delete document',
      `Remove "${doc.file_name}" and all its analysed data? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(doc.id);
            try {
              await documentsDelete(doc.id);
              setDocs((prev) => prev.filter((d) => d.id !== doc.id));
            } catch (e: any) {
              Alert.alert('Delete failed', e?.message ?? 'Could not delete document.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  const handleExport = async () => {
    if (exportLoading) return;
    try {
      setExportLoading(true);
      const data = await fetchReport();
      const fullName = [data.profile?.first_name, data.profile?.last_name].filter(Boolean).join(' ') || 'Patient';
      await shareReportAsPdf(data, fullName);
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
        contentContainerStyle={[styles.content, { justifyContent: 'flex-start', opacity: busy ? 0.7 : 1, paddingBottom: TAB_BAR_HEIGHT }]}
      >
        <Text style={styles.title}>{t('records.title')}</Text>
        <Text style={styles.helper}>{t('records.helper')}</Text>

        <TouchableOpacity
          style={[styles.btnPrimary, (busy || exportLoading) ? styles.btnPrimaryDisabled : null, { marginBottom: 8 }]}
          onPress={handleExport}
          disabled={busy || exportLoading}
        >
          {exportLoading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnPrimaryText}>{t('records.exportReport')}</Text>
          }
        </TouchableOpacity>

        <Text style={{ fontSize: 11, color: colors.grey500, lineHeight: 16, marginBottom: 24 }}>
          Generated from patient-reported information only. This is not a clinical assessment, always consult a qualified healthcare provider.
        </Text>

        {/* ── OgwuAI Document Analysis ── */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={styles.label}>AI Document Analysis</Text>
        </View>

        {docsLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <ThinkingIndicator />
          </View>
        ) : docs.length === 0 ? (
          <GlassCard borderRadius={14} innerStyle={{ padding: spacing.lg, alignItems: 'center' }}>
            <View style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: 'rgba(123,77,217,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}>
              <MaterialIcons name="upload-file" size={24} color={colors.purple} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.grey900, marginBottom: 6, textAlign: 'center' }}>
              No documents yet
            </Text>
            <Text style={{ fontSize: 13, color: colors.grey500, textAlign: 'center', lineHeight: 20, marginBottom: 18 }}>
              Upload lab results, prescriptions, or imaging reports. OgwuAI will analyse them and make them available in your consultations.
            </Text>
            <TouchableOpacity
              style={[styles.btnPrimary, { width: '100%' }]}
              onPress={onUpload}
              disabled={busy}
            >
              <Text style={styles.btnPrimaryText}>Upload document</Text>
            </TouchableOpacity>
          </GlassCard>
        ) : (
          <>
            {docs.map((doc) => (
              <DocRow
                key={doc.id}
                doc={doc}
                onDelete={() => handleDelete(doc)}
                deleting={deletingId === doc.id}
              />
            ))}
            <View style={{ height: 1, backgroundColor: glassSurface.divider, marginVertical: 16 }} />
            <TouchableOpacity
              style={[styles.btnPrimary, busy ? styles.btnPrimaryDisabled : null]}
              onPress={onUpload}
              disabled={busy}
            >
              <Text style={styles.btnPrimaryText}>Upload another document</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
