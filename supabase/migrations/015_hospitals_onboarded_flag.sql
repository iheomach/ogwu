-- Mark which hospitals/clinics are onboarded (eligible for in-app scheduling)

alter table public.hospitals_directory
  add column if not exists is_onboarded boolean not null default false;

create index if not exists hospitals_directory_is_onboarded_idx
  on public.hospitals_directory (is_onboarded);
