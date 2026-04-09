-- Agent-generated consults

create extension if not exists pgcrypto;

create table if not exists public.consults (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,

  complaint text not null,
  urgency text not null,
  symptoms text[] not null default '{}'::text[],
  recommended_specialty text,
  care_pathway text,
  recommended_hospital_ids uuid[],

  is_emergency_flagged boolean not null default false,

  created_at timestamptz not null default now()
);

alter table public.consults enable row level security;

alter table public.consults
  drop constraint if exists consults_urgency_check;
alter table public.consults
  add constraint consults_urgency_check
  check (urgency in ('emergency', 'urgent', 'routine', 'self_care'));

create index if not exists consults_patient_id_idx on public.consults(patient_id);
create index if not exists consults_created_at_idx on public.consults(created_at desc);

create policy "Patients can read own consults"
  on public.consults for select
  using (auth.uid() = patient_id);

create policy "Patients can insert own consults"
  on public.consults for insert
  with check (auth.uid() = patient_id);
