-- Google OAuth tokens for single clinic calendar + appointments with Google Meet links

create extension if not exists pgcrypto;

-- Store OAuth tokens for external integrations. For the clinic calendar we expect exactly one row keyed by provider='google_calendar'.
create table if not exists public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  access_token text,
  refresh_token text,
  scope text,
  token_type text,
  expiry timestamptz,
  -- Extra provider-specific metadata (e.g., calendarId, connected email)
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists integration_tokens_provider_uniq
  on public.integration_tokens (provider);

alter table public.integration_tokens enable row level security;

-- No public policies by default: readable/writable only with service role from backend.

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),

  patient_id uuid not null references public.profiles(id) on delete cascade,

  -- Optional links (depending on whether user scheduled a specific doctor or just a hospital clinic)
  doctor_id uuid references public.doctors(id) on delete set null,
  hospital_id uuid references public.hospitals_directory(id) on delete set null,

  status text not null default 'scheduled',

  -- Store canonical time in UTC + timezones explicitly used in selection
  starts_at timestamptz not null,
  duration_minutes int not null default 30,
  patient_time_zone text not null,
  provider_time_zone text not null,

  -- Google Calendar/Meet fields
  calendar_event_id text,
  meeting_url text,

  -- Patient-entered notes + AI-generated call script (optional)
  reason text,
  call_script text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointments enable row level security;

alter table public.appointments
  drop constraint if exists appointments_status_check;
alter table public.appointments
  add constraint appointments_status_check
  check (status in ('scheduled', 'cancelled', 'completed'));

create index if not exists appointments_patient_id_idx on public.appointments(patient_id);
create index if not exists appointments_starts_at_idx on public.appointments(starts_at desc);

-- RLS: patients can manage their own appointments
create policy "Users can view their own appointments"
  on public.appointments for select
  using (auth.uid() = patient_id);

create policy "Users can insert their own appointments"
  on public.appointments for insert
  with check (auth.uid() = patient_id);

create policy "Users can update their own appointments"
  on public.appointments for update
  using (auth.uid() = patient_id);
