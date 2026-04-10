-- Add geocoordinates to hospitals_directory for Haversine distance ranking
alter table public.hospitals_directory
  add column if not exists lat double precision,
  add column if not exists lon double precision;
