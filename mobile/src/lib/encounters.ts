import { apiGet, apiPost } from './api';
import type { Encounter } from '../types';

export type EncountersListResponse = {
  encounters: Encounter[];
};

export type EncounterCreateShareResponse = {
  encounter: Omit<Encounter, 'doctor'>;
};

export async function encountersList(): Promise<EncountersListResponse> {
  return apiGet<EncountersListResponse>('/api/encounters');
}

export async function encountersCreateShare(params: { doctor_id?: string | null }): Promise<EncounterCreateShareResponse> {
  return apiPost<EncounterCreateShareResponse>('/api/encounters/share', params);
}
