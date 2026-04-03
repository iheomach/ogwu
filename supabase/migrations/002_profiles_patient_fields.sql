-- Add patient onboarding fields to profiles
alter table public.profiles
  add column if not exists age int,
  add column if not exists sex text,
  add column if not exists known_conditions text;

-- Populate phone on profile creation (useful for OTP auth)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data->>'full_name', new.phone);
  return new;
end;
$$ language plpgsql security definer;
