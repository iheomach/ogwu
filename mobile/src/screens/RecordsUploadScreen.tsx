import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

import type { RecordsUploadScreenProps } from '../types';
import {
  documentsInitUpload,
  documentsGetStatus,
  uploadFileToS3,
  type DocumentStatus,
} from '../lib/documents';
import { colors, glassSurface, spacing, styles } from '../ui/styles';
import { GlassCard } from '../ui/GlassCard';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/heic',
];

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 80; // 4 min ceiling

type Stage = 'idle' | 'uploading' | 'processing' | 'complete' | 'failed';

function statusToStage(s: DocumentStatus): Stage {
  if (s === 'complete') return 'complete';
  if (s === 'failed') return 'failed';
  return 'processing';
}

function StageIcon({ stage }: { stage: Stage }) {
  if (stage === 'complete')
    return <MaterialIcons name="check-circle" size={40} color={colors.success} />;
  if (stage === 'failed')
    return <MaterialIcons name="error" size={40} color={colors.error} />;
  return <ActivityIndicator size="large" color={colors.purple} />;
}

function stageLabel(stage: Stage, uploadPct: number): string {
  switch (stage) {
    case 'uploading':   return `Uploading… ${uploadPct}%`;
    case 'processing':  return 'OgwuAI is analysing your document…';
    case 'complete':    return 'Analysis complete';
    case 'failed':      return 'Processing failed';
    default:            return '';
  }
}

export function RecordsUploadScreen({ onDone }: RecordsUploadScreenProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [uploadPct, setUploadPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, speed: 14, bounciness: 4, useNativeDriver: true }),
    ]).start();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startPolling = useCallback((documentId: string) => {
    pollCount.current = 0;
    pollRef.current = setInterval(async () => {
      pollCount.current += 1;
      try {
        const doc = await documentsGetStatus(documentId);
        const next = statusToStage(doc.status);
        if (next === 'complete' || next === 'failed') {
          clearInterval(pollRef.current!);
          if (next === 'failed') setErrorMsg(doc.error ?? 'Processing failed. Please try again.');
          setStage(next);
        }
      } catch {
        // transient network error — keep polling
      }
      if (pollCount.current >= MAX_POLLS) {
        clearInterval(pollRef.current!);
        setErrorMsg('Processing is taking longer than expected. Check back later.');
        setStage('failed');
      }
    }, POLL_INTERVAL_MS);
  }, []);

  const handlePick = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ALLOWED_TYPES,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? 'application/octet-stream';
      const fileName = asset.name;

      setStage('uploading');
      setUploadPct(0);
      setErrorMsg(null);

      const { documentId, uploadUrl } = await documentsInitUpload(fileName, mimeType);
      await uploadFileToS3(uploadUrl, asset.uri, mimeType, setUploadPct);

      setStage('processing');
      startPolling(documentId);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Something went wrong. Please try again.');
      setStage('failed');
    }
  }, [startPolling]);

  const handleRetry = useCallback(() => {
    setStage('idle');
    setErrorMsg(null);
    setUploadPct(0);
  }, []);

  const isActive = stage === 'uploading' || stage === 'processing';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <Animated.View
        style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
          <TouchableOpacity onPress={onDone} disabled={isActive} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <MaterialIcons name="arrow-back" size={22} color={isActive ? colors.grey500 : colors.grey900} />
          </TouchableOpacity>
          <Text style={[styles.title, { marginBottom: 0, marginLeft: spacing.md }]}>Upload document</Text>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, flex: 1 }}>

          {/* Idle state — file picker */}
          {stage === 'idle' && (
            <TouchableOpacity onPress={handlePick} activeOpacity={0.85}>
              <GlassCard
                borderRadius={10}
                innerStyle={{ padding: spacing.xl, alignItems: 'center', gap: 12 }}
              >
                <View style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: 'rgba(123,77,217,0.18)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <MaterialIcons name="upload-file" size={30} color={colors.purple} />
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.grey900, textAlign: 'center' }}>
                  Tap to choose a file
                </Text>
                <Text style={{ fontSize: 13, color: colors.grey500, textAlign: 'center', lineHeight: 20 }}>
                  PDF, Word, JPEG, PNG, or HEIC{'\n'}up to any size
                </Text>
              </GlassCard>
            </TouchableOpacity>
          )}

          {/* Active / complete / failed */}
          {stage !== 'idle' && (
            <GlassCard
              borderRadius={10}
              innerStyle={{ padding: spacing.xl, alignItems: 'center', gap: 16 }}
            >
              <StageIcon stage={stage} />

              <Text style={{
                fontSize: 15,
                fontWeight: '600',
                color: stage === 'failed' ? colors.error : colors.grey900,
                textAlign: 'center',
              }}>
                {stageLabel(stage, uploadPct)}
              </Text>

              {errorMsg && (
                <Text style={{ fontSize: 13, color: colors.error, textAlign: 'center', lineHeight: 20 }}>
                  {errorMsg}
                </Text>
              )}

              {/* Upload progress bar */}
              {stage === 'uploading' && (
                <View style={{ width: '100%', height: 4, borderRadius: 2, backgroundColor: glassSurface.bg, overflow: 'hidden' }}>
                  <View style={{ width: `${uploadPct}%`, height: '100%', backgroundColor: colors.purple, borderRadius: 2 }} />
                </View>
              )}

              {stage === 'complete' && (
                <TouchableOpacity
                  style={[styles.btnPrimary, { width: '100%' }]}
                  onPress={onDone}
                >
                  <Text style={styles.btnPrimaryText}>Done</Text>
                </TouchableOpacity>
              )}

              {stage === 'failed' && (
                <View style={{ width: '100%', gap: 10 }}>
                  <TouchableOpacity style={[styles.btnPrimary, { width: '100%' }]} onPress={handleRetry}>
                    <Text style={styles.btnPrimaryText}>Try again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnPrimary, styles.btnPrimaryDisabled, { width: '100%' }]} onPress={onDone}>
                    <Text style={styles.btnPrimaryText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </GlassCard>
          )}

          {/* Supported formats note */}
          {stage === 'idle' && (
            <Text style={{ fontSize: 12, color: colors.grey500, textAlign: 'center', marginTop: spacing.lg, lineHeight: 18 }}>
              Lab results, prescriptions, and imaging reports are supported.{'\n'}
              OgwuAI will analyse the document and make it available to your care team.
            </Text>
          )}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}
