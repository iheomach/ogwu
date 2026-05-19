import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { PhoneScreen } from './screens/PhoneScreen';
import { OtpScreen } from './screens/OtpScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { HomeScreen } from './screens/HomeScreen';
import { TriageScreen } from './screens/TriageScreen';
import { TriageResultsScreen } from './screens/TriageResultsScreen';
import { HealthAssistantScreen } from './screens/HealthAssistantScreen';
import { RecordsScreen } from './screens/RecordsScreen';
import { InboxScreen } from './screens/InboxScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ThreadScreen } from './screens/ThreadScreen';
import { SendToHospitalScreen } from './screens/SendToHospitalScreen';
import { initI18n, setLocale as persistLocale, t } from './i18n';
import type { SupportedLocale } from './i18n/translations';
import type { TriageQA } from './types';
import { triageComplete, triageNext, triageStatus } from './lib/triage';
import { apiDelete } from './lib/api';
import { TabScaffold, type TabKey } from './ui/TabScaffold';
import { requestAndGetLocation, formatLocation, type LocationSummary } from './lib/location';

export function AppRouter() {
  const [isBooting, setIsBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [locationSummary, setLocationSummary] = useState<LocationSummary | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [screen, setScreen] = useState<AppScreen>('phone');
  const [locale, setLocale] = useState<SupportedLocale>('en');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [openThreadCount, setOpenThreadCount] = useState(0);

  const [triageQa, setTriageQa] = useState<TriageQA[]>([]);
  const [triageQuestion, setTriageQuestion] = useState('');
  const [triageAnswer, setTriageAnswer] = useState('');

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

  const resetTriage = () => {
    setTriageQa([]);
    setTriageQuestion('');
    setTriageAnswer('');
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

        // Request location on launch — runs in parallel with session restore.
        requestAndGetLocation()
          .then((loc) => { if (isMounted) setLocationSummary(loc); })
          .catch(() => {});

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
        setScreen('phone');
        resetTriage();
        return;
      }

      try {
        setBusy(true);
        const loaded = await loadProfile(user);
        if (!isMounted) return;
        setProfile(loaded);

        if (isProfileComplete(loaded)) {
          // If profile is complete, run triage once after signup.
          try {
            const status = await triageStatus();
            if (!isMounted) return;
            if (status.completed) {
              setScreen('home');
            } else {
              resetTriage();
              setScreen('triage');
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

  // ─── Triage: load first question on entry ──────────────────────────────
  useEffect(() => {
    let isMounted = true;

    (async () => {
      if (screen !== 'triage') return;
      if (!user) return;
      if (triageQuestion.trim().length > 0) return;

      try {
        setBusy(true);
        const res = await triageNext({
          locale,
          profile: profile ?? {},
          qa: triageQa,
          location: formatLocation(locationSummary),
        });

        if (!isMounted) return;

        if (res.done) {
          // Nothing to ask; still record completion so we don't prompt again.
          try {
            const saved = await triageComplete({ locale, profile: profile ?? {}, qa: triageQa, location: formatLocation(locationSummary) });
            if (!isMounted) return;
            if (saved.safety_note) {
              Alert.alert(t('triage.safetyTitle'), saved.safety_note);
            }
          } catch {
            // Non-fatal
          }
          if (!isMounted) return;
          setScreen('triageResults');
          return;
        }

        setTriageQuestion(res.question ?? t('triage.fallbackQuestion'));
      } catch (err: any) {
        Alert.alert(t('errors.triageTitle'), err?.message ?? t('errors.triageBody'));
        setScreen('home');
      } finally {
        if (isMounted) setBusy(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [screen, user?.id]);

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
        resetTriage();
        setScreen('triage');
      } else {
        setScreen('onboarding');
      }
    } catch (err: any) {
      Alert.alert(t('errors.saveTitle'), err?.message ?? t('errors.saveBody'));
    } finally {
      setBusy(false);
    }
  };

  const onTriageNext = async () => {
    if (!user) return;
    const q = triageQuestion.trim();
    const a = triageAnswer.trim();
    if (!q || !a) return;

    const nextQa = [...triageQa, { q, a }];
    setTriageQa(nextQa);
    setTriageAnswer('');

    try {
      setBusy(true);
      const res = await triageNext({
        locale,
        profile: profile ?? {},
        qa: nextQa,
        location: formatLocation(locationSummary),
      });

      if (res.done) {
        const saved = await triageComplete({ locale, profile: profile ?? {}, qa: nextQa, location: formatLocation(locationSummary) });
        if (saved.safety_note) {
          Alert.alert(t('triage.safetyTitle'), saved.safety_note);
        }
        resetTriage();
        setScreen('triageResults');
        return;
      }

      setTriageQuestion(res.question ?? t('triage.fallbackQuestion'));
    } catch (err: any) {
      Alert.alert(t('errors.triageTitle'), err?.message ?? t('errors.triageBody'));
      resetTriage();
      setScreen('home');
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
      resetTriage();
      setProfile(null);
      setScreen('phone');
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
  if (isBooting) {
    return (
      <LinearGradient
        colors={['#1a0a2e', '#3d1670', '#1a0a2e']}
        locations={[0, 0.55, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.center}
      >
        <Image
          source={require('../assets/ogwu-ios.png')}
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
      colors={['#1a0a2e', '#3d1670', '#1a0a2e']}
      locations={[0, 0.55, 1]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={{ flex: 1 }}
    >
      <StatusBar style="light" />
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

      {screen === 'triage' && (
        <TriageScreen
          busy={busy}
          question={triageQuestion || t('triage.loadingQuestion')}
          answer={triageAnswer}
          setAnswer={setTriageAnswer}
          onBack={() => setScreen('profile')}
          onNext={onTriageNext}
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
            onRunTriage={() => { resetTriage(); setScreen('triage'); }}
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
          />
        </TabScaffold>
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
            onRunTriage={() => {
              resetTriage();
              setScreen('triage');
            }}
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