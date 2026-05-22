-- Logged when the agent hits 3 cumulative tool failures in a session.
-- Gives the ops team visibility into broken sessions with full context.
create table if not exists session_escalations (
  id               bigint generated always as identity primary key,
  patient_id       uuid references auth.users(id) on delete set null,
  failure_count    integer      not null,
  last_error       text,
  message_context  jsonb,
  created_at       timestamptz  not null default now()
);

alter table session_escalations enable row level security;
