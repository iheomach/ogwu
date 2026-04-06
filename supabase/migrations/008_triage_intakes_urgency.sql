-- Add urgency tier to triage intakes (clinic co-pilot)

alter table public.triage_intakes
  add column if not exists urgency text not null default 'routine';

-- Guardrail: keep values predictable
alter table public.triage_intakes
  drop constraint if exists triage_intakes_urgency_check;

alter table public.triage_intakes
  add constraint triage_intakes_urgency_check
  check (urgency in ('routine', 'soon', 'urgent', 'emergency'));
