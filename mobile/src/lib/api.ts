import { supabase } from '../../lib/supabase';

async function readError(res: Response): Promise<string> {
  try {
    const json = await res.json();
    const msg = (json as any)?.error;
    if (typeof msg === 'string' && msg.trim().length > 0) return msg;
    return JSON.stringify(json);
  } catch {
    try {
      const text = await res.text();
      return text;
    } catch {
      return '';
    }
  }
}

async function getBaseUrl(): Promise<string> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!baseUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_URL');
  }
  return baseUrl.replace(/\/$/, '');
}

async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return token;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getAuthToken();
  const baseUrl = await getBaseUrl();

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await readError(res);
    throw new Error(detail || `Request failed (${res.status})`);
  }

  return (await res.json()) as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const token = await getAuthToken();
  const baseUrl = await getBaseUrl();

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const detail = await readError(res);
    throw new Error(detail || `Request failed (${res.status})`);
  }

  return (await res.json()) as T;
}
