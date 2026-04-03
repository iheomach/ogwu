-- AI triage/intake responses (short post-signup flow)

create table if not exists public.triage_intakes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  locale text,
  answers jsonb not null,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.triage_intakes enable row level security;

-- Users can read their own intake
create policy "Users can view their own triage intake"
  on public.triage_intakes for select
  using (auth.uid() = user_id);

-- Users can create their own intake
create policy "Users can insert their own triage intake"
  on public.triage_intakes for insert
  with check (auth.uid() = user_id);

-- Users can update their own intake (if they re-run triage)
create policy "Users can update their own triage intake"
  on public.triage_intakes for update
  using (auth.uid() = user_id);

create index if not exists triage_intakes_user_id_idx on public.triage_intakes(user_id);

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_on_triage_intakes on public.triage_intakes;
create trigger set_updated_at_on_triage_intakes
before update on public.triage_intakes
for each row execute procedure public.set_updated_at();
