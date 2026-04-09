-- Add fields needed for agentic hospital search/recommendations.
-- Directory is maintained manually.

alter table public.hospitals_directory
  add column if not exists state text,
  add column if not exists city text,
  add column if not exists type text,
  add column if not exists tier int,
  add column if not exists specialties text[] not null default '{}'::text[],
  add column if not exists has_emergency boolean not null default false,
  add column if not exists is_active boolean not null default true;

-- Backfill state from existing admin1 values for convenience.
update public.hospitals_directory
set state = coalesce(state, admin1)
where state is null and admin1 is not null;

create index if not exists hospitals_directory_state_idx on public.hospitals_directory(state);
create index if not exists hospitals_directory_city_idx on public.hospitals_directory(city);
create index if not exists hospitals_directory_tier_idx on public.hospitals_directory(tier);
create index if not exists hospitals_directory_has_emergency_idx on public.hospitals_directory(has_emergency);
create index if not exists hospitals_directory_is_active_idx on public.hospitals_directory(is_active);
