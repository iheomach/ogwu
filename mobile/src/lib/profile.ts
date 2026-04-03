import { supabase } from '../../lib/supabase';
import type { Profile } from '../types';
import type { User } from '@supabase/supabase-js';

export function isProfileComplete(profile: Profile | null): boolean {
  if (!profile) return false;
  const hasFirst = !!profile.first_name && profile.first_name.trim().length > 0;
  const hasLast = !!profile.last_name && profile.last_name.trim().length > 0;
  const hasDob = !!profile.dob && profile.dob.trim().length > 0;
  const hasSex = !!profile.biological_sex && profile.biological_sex.trim().length > 0;
  return hasFirst && hasLast && hasDob && hasSex;
}

export async function loadProfile(user: User): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, phone, first_name, middle_name, last_name, dob, biological_sex, allergies, known_conditions'
    )
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}
