import type { Profile, TriageQA } from '../types';
import type { SupportedLocale } from '../i18n/translations';

import { apiGet, apiPost } from './api';

export type NextQuestionResponse = {
  done: boolean;
  question: string | null;
  summary: string | null;
  safety_note: string | null;
};

export type CompleteResponse = {
  intake: {
    user_id: string;
    locale: string | null;
    answers: TriageQA[];
    summary: string | null;
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
  answers: TriageQA[];
  summary: string | null;
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
}): Promise<NextQuestionResponse> {
  return apiPost<NextQuestionResponse>('/api/triage/next', params);
}

export async function triageComplete(params: {
  locale: SupportedLocale;
  profile: Partial<Profile>;
  qa: TriageQA[];
}): Promise<CompleteResponse> {
  return apiPost<CompleteResponse>('/api/triage/complete', params);
}

export async function triageStatus(): Promise<TriageStatusResponse> {
  return apiGet<TriageStatusResponse>('/api/triage/status');
}

export async function triageGetIntake(): Promise<TriageIntakeResponse> {
  return apiGet<TriageIntakeResponse>('/api/triage/intake');
}
