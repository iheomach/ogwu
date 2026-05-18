-- Add fhir_encounter_id to link Supabase encounter records to their
-- authoritative clinical counterpart in AWS HealthLake.
-- Clinical columns (urgency, summary, safety_note, answers) are made nullable
-- so they can be omitted once HealthLake is the primary clinical store.

ALTER TABLE encounters
  ADD COLUMN IF NOT EXISTS fhir_encounter_id text,
  ALTER COLUMN urgency    DROP NOT NULL,
  ALTER COLUMN summary    DROP NOT NULL,
  ALTER COLUMN safety_note DROP NOT NULL,
  ALTER COLUMN answers    DROP NOT NULL;
