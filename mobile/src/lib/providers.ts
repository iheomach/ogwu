import { apiPost } from './api';
import type { ExternalProviderResult } from '../types';

export async function providersLookup(query: string): Promise<ExternalProviderResult> {
  return apiPost('/api/providers/lookup', { query });
}
