import type { Profile, TriageQA, UrgencyTier } from '../types';
import type { SupportedLocale } from '../i18n/translations';

import { apiGet, apiPost } from './api';

export type NextQuestionResponse = {
  done: boolean;
  question: string | null;
  summary: string | null;
  safety_note: string | null;
  suggestions: string[];
};

export type CompleteResponse = {
  intake: {
    user_id: string;
    locale: string | null;
    urgency: UrgencyTier;
    answers: TriageQA[];
    summary: string | null;
    safety_note?: string | null;
    created_at: string;
    updated_at: string;
  };
  safety_note: string | null;
};

export type TriageStatusResponse = {
  completed: boolean;
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

export type TriageIntakeResponse = {
  intake: TriageIntake | null;
};

export async function triageNext(params: {
  locale: SupportedLocale;
  profile: Partial<Profile>;
  qa: TriageQA[];
  location?: string | null;
}): Promise<NextQuestionResponse> {
  return apiPost<NextQuestionResponse>('/api/triage/next', params);
}

export async function triageComplete(params: {
  locale: SupportedLocale;
  profile: Partial<Profile>;
  qa: TriageQA[];
  location?: string | null;
}): Promise<CompleteResponse> {
  return apiPost<CompleteResponse>('/api/triage/complete', params);
}

export async function triageStatus(): Promise<TriageStatusResponse> {
  return apiGet<TriageStatusResponse>('/api/triage/status');
}

export async function triageGetIntake(): Promise<TriageIntakeResponse> {
  return apiGet<TriageIntakeResponse>('/api/triage/intake');
}

export async function triageHomeSummary(): Promise<{ summary: string | null }> {
  return apiGet<{ summary: string | null }>('/api/triage/home-summary');
}
