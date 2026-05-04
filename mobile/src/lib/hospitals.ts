import { apiGet } from './api';

export type Hospital = {
  id: string;
  name: string;
  location: string;
  specialty_tags?: string[];
  admin1?: string;
  country?: string;
};

export async function hospitalsList(): Promise<{ hospitals: Hospital[] }> {
  return apiGet('/api/hospitals');
}
