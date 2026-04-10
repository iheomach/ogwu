-- Allow US hospitals (needed for local development / testing outside NG and IN)
alter table public.hospitals_directory
  drop constraint if exists hospitals_directory_country_check;

alter table public.hospitals_directory
  add constraint hospitals_directory_country_check
  check (country in ('NG', 'IN', 'US'));
