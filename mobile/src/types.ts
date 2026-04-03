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

export type AppScreen =
  | 'phone'
  | 'otp'
  | 'onboarding'
  | 'triage'
  | 'triageResults'
  | 'home'
  | 'newConsult'
  | 'records'
  | 'profile';

export type ScreenPropsBase = {
  busy: boolean;
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
};

export type NewConsultScreenProps = ScreenPropsBase;

export type RecordsScreenProps = ScreenPropsBase;

export type ProfileScreenProps = ScreenPropsBase & {
  phoneLabel: string;
  profile: Profile | null;
  locale: SupportedLocale;
  onChangeLocale: (locale: SupportedLocale) => void;
  onRunTriage: () => void;
  onViewTriageResults: () => void;
  onLogout: () => void;
};

export type TriageIntake = {
  user_id: string;
  locale: string | null;
  answers: TriageQA[];
  summary: string | null;
  created_at: string;
  updated_at: string;
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
  step: number;
  total: number;
  question: string;
  answer: string;
  setAnswer: (value: string) => void;
  onNext: () => void;
};
