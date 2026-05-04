import type { ConsultMessage, ConsultThread } from '../types';
import { apiGet, apiPost } from './api';

export async function threadsList(): Promise<{ threads: ConsultThread[] }> {
  return apiGet('/api/threads');
}

export async function threadsCreate(payload: {
  hospital_id?: string | null;
  doctor_id?: string | null;
  external_provider?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    booking_url?: string | null;
    address?: string | null;
    source_url?: string | null;
  } | null;
}): Promise<{ thread: ConsultThread }> {
  return apiPost('/api/threads', payload);
}

export async function threadMessagesList(threadId: string): Promise<{ messages: ConsultMessage[] }> {
  return apiGet(`/api/threads/${encodeURIComponent(threadId)}/messages`);
}

export async function threadMessageSend(
  threadId: string,
  payload: { body: string }
): Promise<{ message: ConsultMessage }> {
  return apiPost(`/api/threads/${encodeURIComponent(threadId)}/messages`, payload);
}
