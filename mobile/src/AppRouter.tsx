import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import type { AppScreen, Profile } from './types';
import { loadProfile, isProfileComplete } from './lib/profile';
import { colors, styles } from './ui/styles';
import { LandingScreen } from './screens/LandingScreen';
import { PhoneScreen } from './screens/PhoneScreen';
import { OtpScreen } from './screens/OtpScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { HomeScreen } from './screens/HomeScreen';
import { TriageResultsScreen } from './screens/TriageResultsScreen';
import { HealthAssistantScreen } from './screens/HealthAssistantScreen';
import { RecordsScreen } from './screens/RecordsScreen';
import { RecordsUploadScreen } from './screens/RecordsUploadScreen';
import { InboxScreen } from './screens/InboxScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ThreadScreen } from './screens/ThreadScreen';
import { SendToHospitalScreen } from './screens/SendToHospitalScreen';
import { initI18n, setLocale as persistLocale, t } from './i18n';
import type { SupportedLocale } from './i18n/translations';
import { triageStatus } from './lib/triage';
import { apiDelete } from './lib/api';
import { TabScaffold, type TabKey } from './ui/TabScaffold';
import { requestAndGetLocation, formatLocation, type LocationSummary } from './lib/location';
import { registerForPushNotifications } from './lib/notifications';

export function AppRouter() {
  const [isBooting, setIsBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [locationSummary, setLocationSummary] = useState<LocationSummary | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [screen, setScreen] = useState<AppScreen>('landing');
  const [locale, setLocale] = useState<SupportedLocale>('en');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [openThreadCount, setOpenThreadCount] = useState(0);
  const [assistantCheckInRequestId, setAssistantCheckInRequestId] = useState<number | null>(null);

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [biologicalSex, setBiologicalSex] = useState('');
  const [allergies, setAllergies] = useState('');
  const [knownConditions, setKnownConditions] = useState('');

  const user = session?.user ?? null;

  const startAssistantCheckIn = () => {
    setAssistantCheckInRequestId(Date.now());
    setScreen('newConsult');
  };

  const phoneLabel = useMemo(() => {
    const sessionPhone = user?.phone ?? null;
    if (sessionPhone && sessionPhone.trim().length > 0) return sessionPhone;
    const enteredPhone = phone.trim();
    if (enteredPhone.length > 0) return enteredPhone;
    return t('common.yourPhone');
  }, [user?.phone, phone, locale]);

  // ─── Boot: restore session ───────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const initialLocale = await initI18n();
        if (isMounted) setLocale(initialLocale);

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!isMounted) return;
        setSession(data.session ?? null);
      } catch (err: any) {
        Alert.alert(t('errors.authTitle'), err?.message ?? t('errors.authBody'));
      } finally {
        if (isMounted) setIsBooting(false);
      }
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // ─── Load profile when user changes ─────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    (async () => {
      if (!user) {
        setProfile(null);
        setScreen('landing');
        return;
      }

      try {
        setBusy(true);
        const loaded = await loadProfile(user);
        if (!isMounted) return;
        setProfile(loaded);

        // Register / refresh push token on every login — handles re-registration after expiry.
        registerForPushNotifications(user.id).catch(() => {});

        if (isProfileComplete(loaded)) {
          // If profile is complete, run triage once after signup.
          try {
            const status = await triageStatus();
            if (!isMounted) return;
            if (status.completed) {
              setScreen('home');
            } else {
              startAssistantCheckIn();
            }
          } catch {
            // Fail open: if triage status can't be loaded, don't block the app.
            setScreen('home');
          }
        } else {
          setScreen('onboarding');
          setFirstName(loaded?.first_name ?? '');
          setMiddleName(loaded?.middle_name ?? '');
          setLastName(loaded?.last_name ?? '');
          setDob(loaded?.dob ? isoToDobInput(loaded.dob) : '');
          setBiologicalSex(loaded?.biological_sex ?? '');
          setAllergies(loaded?.allergies ?? '');
          setKnownConditions(loaded?.known_conditions ?? '');
        }
      } catch (err: any) {
        const message = err?.message ?? 'Failed to load profile';
        const hint =
          typeof message === 'string' && message.toLowerCase().includes('column')
            ? '\n\nThis usually means the onboarding migration has not been pushed to Supabase yet.'
            : '';
        Alert.alert(t('errors.profileTitle'), message + hint);
      } finally {
        if (isMounted) setBusy(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  // ─── Location: request on-demand when user opens the health assistant ───
  // Deferred from boot so the OS permission dialog has clear context.
  useEffect(() => {
    if (screen !== 'newConsult') return;
    if (locationSummary) return;
    requestAndGetLocation()
      .then((loc) => setLocationSummary(loc))
      .catch(() => {});
  }, [screen]);

  // ─── Handlers ────────────────────────────────────────────────────────────
  const onSendOtp = async () => {
    const normalizedPhone = phone.trim();
    if (!normalizedPhone.startsWith('+') || normalizedPhone.length < 8) {
      Alert.alert(t('phone.invalidTitle'), t('phone.invalidBody'));
      return;
    }
    try {
      setBusy(true);
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
        options: { channel: 'sms', shouldCreateUser: true },
      });
      if (error) throw error;
      setScreen('otp');
    } catch (err: any) {
      Alert.alert(t('errors.otpTitle'), err?.message ?? t('errors.otpBody'));
    } finally {
      setBusy(false);
    }
  };

  const onVerifyOtp = async () => {
    const normalizedPhone = phone.trim();
    const token = otp.trim();
    if (!token) {
      Alert.alert(t('otp.missingTitle'), t('otp.missingBody'));
      return;
    }
    try {
      setBusy(true);
      const { data, error } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token,
        type: 'sms',
      });
      if (error) throw error;
      setSession(data.session ?? null);
    } catch (err: any) {
      Alert.alert(t('errors.verifyTitle'), err?.message ?? t('errors.verifyBody'));
    } finally {
      setBusy(false);
    }
  };

  const onSaveOnboarding = async () => {
    if (!user) return;

    const trimmedFirst = firstName.trim();
    const trimmedMiddle = middleName.trim();
    const trimmedLast = lastName.trim();
    const trimmedSex = biologicalSex.trim();
    const dobIso = dobInputToIso(dob.trim());

    if (!trimmedFirst) {
      Alert.alert(t('onboarding.missingNameTitle'), t('onboarding.missingFirst'));
      return;
    }
    if (!trimmedLast) {
      Alert.alert(t('onboarding.missingNameTitle'), t('onboarding.missingLast'));
      return;
    }
    if (!dobIso) {
      Alert.alert(t('onboarding.invalidDobTitle'), t('onboarding.invalidDobBody'));
      return;
    }
    const birthDate = new Date(dobIso + 'T00:00:00Z');
    const today = new Date();
    let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
    const notYetHadBirthday =
      today.getUTCMonth() < birthDate.getUTCMonth() ||
      (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate());
    if (notYetHadBirthday) age -= 1;
    if (age < 13) {
      Alert.alert('Age requirement', 'Ogwu is only available to users aged 13 and over.');
      return;
    }
    if (!trimmedSex) {
      Alert.alert(t('onboarding.missingSexTitle'), t('onboarding.missingSexBody'));
      return;
    }

    try {
      setBusy(true);
      const payload: Partial<Profile> = {
        first_name: trimmedFirst,
        middle_name: trimmedMiddle.length > 0 ? trimmedMiddle : null,
        last_name: trimmedLast,
        dob: dobIso,
        biological_sex: trimmedSex,
        allergies: allergies.trim() || null,
        known_conditions: knownConditions.trim() || null,
        phone: user.phone ?? (phone.trim().length > 0 ? phone.trim() : null),
      };

      const { data, error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, ...payload }, { onConflict: 'id' })
        .select('id, phone, first_name, middle_name, last_name, dob, biological_sex, known_conditions, allergies')
        .single();

      if (error) throw error;

      if (!data) {
        throw new Error(
          'No profile row returned. This usually means your RLS policies or profile trigger/backfill have not been applied yet.'
        );
      }

      setProfile(data);

      if (isProfileComplete(data)) {
        startAssistantCheckIn();
      } else {
        setScreen('onboarding');
      }
    } catch (err: any) {
      Alert.alert(t('errors.saveTitle'), err?.message ?? t('errors.saveBody'));
    } finally {
      setBusy(false);
    }
  };

  const onChangeLocale = async (next: SupportedLocale) => {
    try {
      await persistLocale(next);
      setLocale(next);
    } catch {
      // If persistence fails, we still set the locale for this session.
      setLocale(next);
    }
  };

  const onLogout = async () => {
    try {
      setBusy(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setPhone('');
      setOtp('');
      setFirstName('');
      setMiddleName('');
      setLastName('');
      setDob('');
      setBiologicalSex('');
      setAllergies('');
      setKnownConditions('');
      setProfile(null);
      setScreen('landing');
    } catch (err: any) {
      Alert.alert(t('errors.logoutTitle'), err?.message ?? t('errors.logoutBody'));
    } finally {
      setBusy(false);
    }
  };

  const onSaveProfile = async (newAllergies: string, newConditions: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .update({ allergies: newAllergies || null, known_conditions: newConditions || null })
      .eq('id', user.id)
      .select('id, phone, first_name, middle_name, last_name, dob, biological_sex, known_conditions, allergies')
      .single();
    if (error) { Alert.alert('Save failed', error.message); return; }
    setProfile(data);
  };

  const onDeleteAccount = async () => {
    try {
      setBusy(true);
      await apiDelete('/api/users/me');
      await supabase.auth.signOut();
      setProfile(null);
      setScreen('phone');
    } catch (err: any) {
      Alert.alert('Delete failed', err?.message ?? 'Could not delete account. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const isTabScreen = (s: AppScreen): s is TabKey =>
    s === 'home' || s === 'newConsult' || s === 'records' || s === 'inbox' || s === 'profile';

  const goTab = (tab: TabKey) => setScreen(tab);

  // ─── Boot splash ─────────────────────────────────────────────────────────
  // Also keep the splash up if a session exists but the profile effect hasn't
  // navigated away from 'landing' yet — prevents a returning user from seeing
  // the landing page for even one frame.
  if (isBooting || (user && screen === 'landing')) {
    return (
      <LinearGradient
        colors={['#080412', '#0f0620', '#080412']}
        locations={[0, 0.55, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.center}
      >
        <Image
          source={require('../assets/ogwu-mark.png')}
          style={styles.bootSplashLogo}
          resizeMode="contain"
        />
        <ActivityIndicator color={colors.purpleGlow} />
      </LinearGradient>
    );
  }

  // ─── Screens ─────────────────────────────────────────────────────────────
  // Each screen manages its own KeyboardAvoidingView + ScrollView.
  // AppRouter wraps everything in a LinearGradient for the dark glass backdrop.
  return (
    <LinearGradient
      colors={['#080412', '#0f0620', '#080412']}
      locations={[0, 0.55, 1]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={{ flex: 1 }}
    >
      {/* Soft glows — concentric rings simulate CSS filter:blur(60px) radial falloff */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        {BLOBS.map((b, i) => (
          <SoftBlob key={i} color={b.color} size={b.size} cx={b.cx} cy={b.cy} />
        ))}
      </View>
      <StatusBar style="light" />
      {screen === 'landing' && (
        <LandingScreen onGetStarted={() => setScreen('phone')} />
      )}

      {screen === 'phone' && (
        <PhoneScreen busy={busy} phone={phone} setPhone={setPhone} onSendOtp={onSendOtp} />
      )}

      {screen === 'otp' && (
        <OtpScreen
          busy={busy}
          phoneLabel={phoneLabel}
          otp={otp}
          setOtp={setOtp}
          onBack={() => setScreen('phone')}
          onVerify={onVerifyOtp}
        />
      )}

      {screen === 'onboarding' && (
        <OnboardingScreen
          busy={busy}
          firstName={firstName}
          setFirstName={setFirstName}
          middleName={middleName}
          setMiddleName={setMiddleName}
          lastName={lastName}
          setLastName={setLastName}
          dob={dob}
          setDob={setDob}
          biologicalSex={biologicalSex}
          setBiologicalSex={setBiologicalSex}
          knownConditions={knownConditions}
          setKnownConditions={setKnownConditions}
          allergies={allergies}
          setAllergies={setAllergies}
          onContinue={onSaveOnboarding}
        />
      )}

      {screen === 'triageResults' && (
        <TriageResultsScreen
          busy={busy}
          onBack={() => setScreen('profile')}
        />
      )}

      {screen === 'home' && (
        <TabScaffold activeTab="home" onNavigate={goTab} locale={locale} openThreadCount={openThreadCount}>
          <HomeScreen
            busy={busy}
            phoneLabel={phoneLabel}
            profile={profile}
            onGoNewConsult={() => setScreen('newConsult')}
            onGoRecords={() => setScreen('records')}
            onGoProfile={() => setScreen('profile')}
            onRunTriage={startAssistantCheckIn}
          />
        </TabScaffold>
      )}

      {screen === 'newConsult' && (
        <TabScaffold activeTab="newConsult" onNavigate={goTab} locale={locale} openThreadCount={openThreadCount}>
          <HealthAssistantScreen
            busy={busy}
            location={formatLocation(locationSummary)}
            lat={locationSummary?.lat ?? null}
            lon={locationSummary?.lon ?? null}
            locale={locale}
            profile={profile}
            checkInRequestId={assistantCheckInRequestId}
            onCheckInRequestConsumed={() => setAssistantCheckInRequestId(null)}
            onOpenThread={(threadId) => {
              setActiveThreadId(threadId);
              setScreen('thread');
            }}
          />
        </TabScaffold>
      )}

      {screen === 'sendToHospital' && (
        <SendToHospitalScreen
          busy={busy}
          onBack={() => setScreen('newConsult')}
          onSent={(threadId) => {
            setActiveThreadId(threadId);
            setScreen('thread');
          }}
        />
      )}

      {screen === 'thread' && activeThreadId && (
        <ThreadScreen
          busy={busy}
          threadId={activeThreadId}
          onBack={() => setScreen('inbox')}
          onCancel={() => setScreen('inbox')}
        />
      )}

      {screen === 'records' && (
        <TabScaffold activeTab="records" onNavigate={goTab} locale={locale} openThreadCount={openThreadCount}>
          <RecordsScreen
            busy={busy}
            onOpenThread={(threadId) => {
              setActiveThreadId(threadId);
              setScreen('thread');
            }}
            onUpload={() => setScreen('recordsUpload')}
          />
        </TabScaffold>
      )}

      {screen === 'recordsUpload' && (
        <RecordsUploadScreen onDone={() => setScreen('records')} />
      )}

      {screen === 'inbox' && (
        <TabScaffold activeTab="inbox" onNavigate={goTab} locale={locale} openThreadCount={openThreadCount}>
          <InboxScreen
            busy={busy}
            onOpenThread={(threadId) => {
              setActiveThreadId(threadId);
              setScreen('thread');
            }}
            onOpenAssistant={() => setScreen('newConsult')}
            onThreadCountChange={setOpenThreadCount}
          />
        </TabScaffold>
      )}

      {screen === 'profile' && (
        <TabScaffold activeTab="profile" onNavigate={goTab} locale={locale} openThreadCount={openThreadCount}>
           <ProfileScreen
            busy={busy}
            phoneLabel={phoneLabel}
            profile={profile}
            locale={locale}
            onChangeLocale={onChangeLocale}
            onRunTriage={startAssistantCheckIn}
            onViewTriageResults={() => setScreen('triageResults')}
            onSaveProfile={onSaveProfile}
            onLogout={onLogout}
            onDeleteAccount={onDeleteAccount}
          />
        </TabScaffold>
      )}
    </LinearGradient>
  );
}

const { width: W, height: H } = Dimensions.get('window');

// Blob center-points matching the reference screenshot
const BLOBS = [
  { color: '#3d1470', size: 660, cx: W * 0.38, cy: H * 0.18 },
  { color: '#6b1a8f', size: 400, cx: W * 0.82, cy: H * 0.72 },
];

// True radial gradient blob — perfectly smooth, no visible edges
function SoftBlob({ color, size, cx, cy }: { color: string; size: number; cx: number; cy: number }) {
  const { Svg, Defs, RadialGradient, Stop, Ellipse } = require('react-native-svg');
  const r = size / 2;
  return (
    <Svg
      width={size}
      height={size}
      style={{ position: 'absolute', left: cx - r, top: cy - r }}
    >
      <Defs>
        <RadialGradient id={`g${color}`} cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
          <Stop offset="0%"   stopColor={color} stopOpacity="0.85" />
          <Stop offset="40%"  stopColor={color} stopOpacity="0.45" />
          <Stop offset="75%"  stopColor={color} stopOpacity="0.15" />
          <Stop offset="100%" stopColor={color} stopOpacity="0"    />
        </RadialGradient>
      </Defs>
      <Ellipse cx={r} cy={r} rx={r} ry={r} fill={`url(#g${color})`} />
    </Svg>
  );
}


function dobInputToIso(input: string): string | null {
  // Expects MM/DD/YYYY
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input);
  if (!match) return null;
  const mm = Number(match[1]);
  const dd = Number(match[2]);
  const yyyy = Number(match[3]);
  if (!Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(yyyy)) return null;
  if (yyyy < 1900 || yyyy > 2100) return null;
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;

  const iso = `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  // Validate via Date round-trip
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  const check = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  return check === iso ? iso : null;
}

function isoToDobInput(iso: string): string {
  // Handles YYYY-MM-DD or full ISO timestamps
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  const yyyy = m[1];
  const mm = m[2];
  const dd = m[3];
  return `${mm}/${dd}/${yyyy}`;
}
