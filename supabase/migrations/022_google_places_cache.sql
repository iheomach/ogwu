-- 24-hour cache for Google Places Nearby Search results.
-- Keyed by rounded lat/lon (3 decimal places ≈ 111 m grid) + radius.
create table if not exists hospital_places_cache (
  id         bigint generated always as identity primary key,
  lat_key    numeric(10, 4) not null,
  lon_key    numeric(10, 4) not null,
  radius_m   integer        not null,
  results    jsonb          not null,
  cached_at  timestamptz    not null default now(),
  constraint hospital_places_cache_geo_uniq unique (lat_key, lon_key, radius_m)
);

-- 30-day LLM specialty inference cache per Google place_id.
create table if not exists hospital_specialties (
  place_id    text        primary key,
  specialty   text        not null,
  confidence  numeric(4, 3),
  inferred_at timestamptz not null default now()
);

-- Add place_id column to hospitals_directory so is_onboarded can be merged
-- by place_id during Places API lookups.
alter table hospitals_directory
  add column if not exists place_id text unique;
