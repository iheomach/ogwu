-- Consultations / encounters
-- Used for “Past consultations” analytics and clinician review.

create extension if not exists pgcrypto;

create table if not exists public.encounters (
  id uuid primary key default gen_random_uuid(),

  patient_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,

  -- Where this encounter came from (helps analytics)
  source text not null default 'share',
  status text not null default 'shared',

  -- Snapshot of the intake at the time of sharing/starting consult
  locale text,
  urgency text not null default 'routine',
  summary text,
  safety_note text,
  answers jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now()
);

alter table public.encounters enable row level security;

-- Guardrails
alter table public.encounters
  drop constraint if exists encounters_source_check;
alter table public.encounters
  add constraint encounters_source_check
  check (source in ('share', 'contact', 'clinic'));

alter table public.encounters
  drop constraint if exists encounters_status_check;
alter table public.encounters
  add constraint encounters_status_check
  check (status in ('shared', 'started', 'completed'));

alter table public.encounters
  drop constraint if exists encounters_urgency_check;
alter table public.encounters
  add constraint encounters_urgency_check
  check (urgency in ('routine', 'soon', 'urgent', 'emergency'));

create index if not exists encounters_patient_id_idx on public.encounters(patient_id);
create index if not exists encounters_created_at_idx on public.encounters(created_at desc);

-- RLS: patients can manage their own encounters
create policy "Users can view their own encounters"
  on public.encounters for select
  using (auth.uid() = patient_id);

create policy "Users can insert their own encounters"
  on public.encounters for insert
  with check (auth.uid() = patient_id);
