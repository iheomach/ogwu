-- Hospitals directory (curated list of established hospitals)
-- Populated/updated by a scheduled job (GitHub Actions cron) using the Supabase service role.

create extension if not exists pgcrypto;

create table if not exists public.hospitals_directory (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  country text not null,
  admin1 text,
  location text,

  -- Contact fields (can be filled by later enrichment)
  phone text,
  email text,
  website text,
  booking_url text,
  address text,

  -- Provenance
  source_url text,
  source_txt text,
  last_verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Guardrails
alter table public.hospitals_directory
  drop constraint if exists hospitals_directory_country_check;
alter table public.hospitals_directory
  add constraint hospitals_directory_country_check
  check (country in ('NG', 'IN'));

-- Uniqueness: names like "Federal Medical Centre" repeat across states, so include admin1.
create unique index if not exists hospitals_directory_country_admin1_name_uniq
  on public.hospitals_directory (country, admin1, name);

create index if not exists hospitals_directory_country_admin1_idx
  on public.hospitals_directory (country, admin1);

create index if not exists hospitals_directory_name_idx
  on public.hospitals_directory (name);

-- Enable RLS (readable by authenticated users; writable only by service role)
alter table public.hospitals_directory enable row level security;

drop policy if exists "Authenticated can read hospitals directory" on public.hospitals_directory;
create policy "Authenticated can read hospitals directory"
  on public.hospitals_directory
  for select
  to authenticated
  using (true);

-- Optional: audit log for downstream notifications / "what changed"
create table if not exists public.hospitals_directory_updates (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid references public.hospitals_directory(id) on delete cascade,
  changed_at timestamptz not null default now(),
  actor text not null default 'cron',
  changes jsonb not null default '{}'::jsonb,
  source_url text
);

alter table public.hospitals_directory_updates enable row level security;

drop policy if exists "Authenticated can read hospitals updates" on public.hospitals_directory_updates;
create policy "Authenticated can read hospitals updates"
  on public.hospitals_directory_updates
  for select
  to authenticated
  using (true);
