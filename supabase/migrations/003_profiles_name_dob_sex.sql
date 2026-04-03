-- Split full name into parts, replace age with DOB, and store biological sex
-- Keeps legacy columns (full_name, age, sex) for backward compatibility.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists dob date,
  add column if not exists biological_sex text;

-- Optional best-effort backfill for existing rows that only have full_name.
-- We only set first_name + last_name when they are currently null.
update public.profiles
set
  first_name = coalesce(first_name, nullif(split_part(full_name, ' ', 1), '')),
  last_name = coalesce(last_name, nullif(split_part(full_name, ' ', 2), ''))
where full_name is not null;
