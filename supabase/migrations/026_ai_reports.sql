create table if not exists ai_reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  message_content text,
  reason          text not null,
  description     text,
  created_at      timestamptz not null default now()
);

alter table ai_reports enable row level security;

-- Users can only insert their own reports; no read access from client
create policy "users can insert own reports"
  on ai_reports for insert
  to authenticated
  with check (user_id = auth.uid() or user_id is null);
