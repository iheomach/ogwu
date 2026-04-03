-- Add allergies field to profiles

alter table public.profiles
  add column if not exists allergies text;
