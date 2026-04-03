-- Drop legacy profile columns once the app has moved to structured fields
-- Legacy: full_name, age, sex

-- Best-effort backfill before dropping full_name
update public.profiles
set
  first_name = coalesce(first_name, nullif(split_part(full_name, ' ', 1), '')),
  last_name = coalesce(last_name, nullif(split_part(full_name, ' ', 2), ''))
where full_name is not null;

alter table public.profiles
  drop column if exists full_name,
  drop column if exists age,
  drop column if exists sex;

-- Update trigger to no longer reference legacy full_name
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone);
  return new;
end;
$$ language plpgsql security definer;
