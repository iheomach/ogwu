alter table profiles
  add column if not exists push_token            text,
  add column if not exists push_token_updated_at timestamptz;
