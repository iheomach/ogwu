-- Persist the AI safety note alongside the saved intake

alter table public.triage_intakes
  add column if not exists safety_note text;
