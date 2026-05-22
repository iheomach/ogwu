-- Audit log for every agent tool invocation.
-- Written by the backend service role (bypasses RLS).
create table if not exists tool_call_logs (
  id          bigint generated always as identity primary key,
  patient_id  uuid references auth.users(id) on delete set null,
  tool_name   text        not null,
  input_args  jsonb,
  output      jsonb,
  ok          boolean     not null default true,
  error_msg   text,
  latency_ms  integer,
  created_at  timestamptz not null default now()
);

-- No patient-facing access — service role only.
alter table tool_call_logs enable row level security;
