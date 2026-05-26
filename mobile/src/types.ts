import type { User } from '@supabase/supabase-js';
import type { SupportedLocale } from './i18n/translations';

export type Profile = {
  id: string;
  phone: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  dob: string | null;
  biological_sex: string | null;
  allergies: string | null;
  known_conditions: string | null;
};

export type UrgencyTier = 'self_care' | 'routine' | 'soon' | 'urgent' | 'emergency';

export type AppScreen =
  | 'landing'
  | 'phone'
  | 'otp'
  | 'onboarding'
  | 'triage'
  | 'triageResults'
  | 'home'
  | 'newConsult'
  | 'sendToHospital'
  | 'thread'
  | 'records'
  | 'recordsUpload'
  | 'inbox'
  | 'profile';

export type ScreenPropsBase = {
  busy: boolean;
  location?: string | null;
  lat?: number | null;
  lon?: number | null;
};

export type PhoneScreenProps = ScreenPropsBase & {
  phone: string;
  setPhone: (value: string) => void;
  onSendOtp: () => void;
};

export type OtpScreenProps = ScreenPropsBase & {
  phoneLabel: string;
  otp: string;
  setOtp: (value: string) => void;
  onBack: () => void;
  onVerify: () => void;
};

export type OnboardingScreenProps = ScreenPropsBase & {
  firstName: string;
  setFirstName: (value: string) => void;
  middleName: string;
  setMiddleName: (value: string) => void;
  lastName: string;
  setLastName: (value: string) => void;
  dob: string;
  setDob: (value: string) => void;
  biologicalSex: string;
  setBiologicalSex: (value: string) => void;
  allergies: string;
  setAllergies: (value: string) => void;
  knownConditions: string;
  setKnownConditions: (value: string) => void;
  onContinue: () => void;
};

export type HomeScreenProps = ScreenPropsBase & {
  phoneLabel: string;
  profile: Profile | null;
  onGoNewConsult: () => void;
  onGoRecords: () => void;
  onGoProfile: () => void;
  onRunTriage: () => void;
};

export type NewConsultScreenProps = ScreenPropsBase & {
  onViewIntake: () => void;
  onOpenThread: (threadId: string) => void;
};

export type SendToHospitalScreenProps = ScreenPropsBase & {
  onBack: () => void;
  onSent: (threadId: string) => void;
};

export type RecordsScreenProps = ScreenPropsBase & {
  onOpenThread: (threadId: string) => void;
  onUpload: () => void;
};

export type RecordsUploadScreenProps = {
  onDone: () => void;
};

export type ProfileScreenProps = ScreenPropsBase & {
  phoneLabel: string;
  profile: Profile | null;
  locale: SupportedLocale;
  onChangeLocale: (locale: SupportedLocale) => void;
  onRunTriage: () => void;
  onViewTriageResults: () => void;
  onSaveProfile: (allergies: string, knownConditions: string) => Promise<void>;
  onLogout: () => void;
  onDeleteAccount: () => Promise<void>;
};

export type TriageIntake = {
  user_id: string;
  locale: string | null;
  urgency: UrgencyTier;
  answers: TriageQA[];
  summary: string | null;
  safety_note?: string | null;
  created_at: string;
  updated_at: string;
};

export type Encounter = {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  source: 'share' | 'contact' | 'clinic';
  status: 'shared' | 'started' | 'completed';
  locale: string | null;
  urgency: UrgencyTier;
  summary: string | null;
  safety_note: string | null;
  created_at: string;
  doctor?: {
    id: string;
    name: string;
    primary_specialty: string;
    hospital_name: string;
    location: string;
  } | null;
};

export type ExternalProvider = {
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  booking_url: string | null;
  address: string | null;
  source_url: string | null;
};

export type ExternalProviderResult = {
  providers: ExternalProvider[];
  notice: string | null;
  suggested_queries?: string[];
};

export type ConsultThread = {
  id: string;
  patient_id: string;
  provider_type: 'onboarded' | 'external' | 'hospital';
  doctor_id: string | null;
  hospital_id: string | null;
  hospital_name: string | null;
  title: string | null;
  external_provider: ExternalProvider | null;
  locale: string | null;
  urgency: UrgencyTier;
  status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  doctor?: {
    id: string;
    name: string;
    primary_specialty: string;
    hospital_name: string;
    location: string;
  } | null;
  intake_snapshot?: {
    urgency: UrgencyTier;
    summary: string | null;
    answers: Array<{ q: string; a: string }>;
  } | null;
  last_message?: {
    thread_id: string;
    body: string;
    sender_role: 'patient' | 'provider' | 'system';
    created_at: string;
  } | null;
};

export type ConsultMessage = {
  id: string;
  thread_id: string;
  sender_role: 'patient' | 'provider' | 'system';
  body: string;
  created_at: string;
};

export type TriageResultsScreenProps = ScreenPropsBase & {
  onBack: () => void;
};

export type ProfileLoadParams = {
  user: User;
};

export type TriageQA = {
  q: string;
  a: string;
};

export type TriageScreenProps = ScreenPropsBase & {
  question: string;
  questionIndex: number;
  answer: string;
  setAnswer: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
  suggestions?: string[];
};
