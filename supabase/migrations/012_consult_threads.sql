-- Async consult threads (patient ↔ provider)
-- Payments intentionally NOT included (post-MVP).

create extension if not exists pgcrypto;

create table if not exists public.consult_threads (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  provider_type text not null,
  doctor_id uuid references public.doctors(id) on delete set null,
  external_provider jsonb,
  locale text,
  urgency text not null default 'routine',
  intake_snapshot jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint consult_threads_provider_type_check
    check (provider_type in ('onboarded', 'external')),

  constraint consult_threads_status_check
    check (status in ('open', 'closed')),

  constraint consult_threads_urgency_check
    check (urgency in ('routine', 'soon', 'urgent', 'emergency'))
);

create index if not exists consult_threads_patient_id_idx on public.consult_threads(patient_id);
create index if not exists consult_threads_created_at_idx on public.consult_threads(created_at desc);

-- updated_at trigger (reuses public.set_updated_at() from earlier migrations)

drop trigger if exists set_updated_at_on_consult_threads on public.consult_threads;
create trigger set_updated_at_on_consult_threads
before update on public.consult_threads
for each row execute procedure public.set_updated_at();

alter table public.consult_threads enable row level security;

create policy "Patients can view their own consult threads"
  on public.consult_threads for select
  using (auth.uid() = patient_id);

create policy "Patients can create their own consult threads"
  on public.consult_threads for insert
  with check (auth.uid() = patient_id);

create policy "Patients can update their own consult threads"
  on public.consult_threads for update
  using (auth.uid() = patient_id);


create table if not exists public.consult_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.consult_threads(id) on delete cascade,
  sender_role text not null,
  body text not null,
  created_at timestamptz not null default now(),

  constraint consult_messages_sender_role_check
    check (sender_role in ('patient', 'provider', 'system'))
);

create index if not exists consult_messages_thread_id_idx on public.consult_messages(thread_id);
create index if not exists consult_messages_created_at_idx on public.consult_messages(created_at desc);

alter table public.consult_messages enable row level security;

create policy "Patients can view messages for their threads"
  on public.consult_messages for select
  using (
    exists (
      select 1
      from public.consult_threads t
      where t.id = consult_messages.thread_id
        and t.patient_id = auth.uid()
    )
  );

create policy "Patients can send messages in their threads"
  on public.consult_messages for insert
  with check (
    sender_role = 'patient'
    and exists (
      select 1
      from public.consult_threads t
      where t.id = consult_messages.thread_id
        and t.patient_id = auth.uid()
    )
  );
