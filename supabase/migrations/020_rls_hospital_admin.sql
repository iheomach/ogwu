-- Comprehensive hospital admin RLS setup (idempotent)
-- Run this to ensure all hospital admin policies are correct.

-- ----------------------------------------------------------------
-- 0. Add admin_user_id to hospitals_directory (if not already there)
--    After running, set it: UPDATE hospitals_directory
--      SET admin_user_id = '<auth-uid>' WHERE id = '<hospital-id>';
-- ----------------------------------------------------------------
alter table public.hospitals_directory
  add column if not exists admin_user_id uuid references auth.users(id);

create index if not exists hospitals_directory_admin_user_id_idx
  on public.hospitals_directory (admin_user_id);

-- ----------------------------------------------------------------
-- 1. profiles: hospital admins can read any patient profile
-- ----------------------------------------------------------------
drop policy if exists "Hospital admins can view patient profiles" on public.profiles;
create policy "Hospital admins can view patient profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.hospitals_directory
      where admin_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- 2. triage_intakes: hospital admins can read patient triage data
-- ----------------------------------------------------------------
drop policy if exists "Hospital admins can view patient triage intakes" on public.triage_intakes;
create policy "Hospital admins can view patient triage intakes"
  on public.triage_intakes for select
  using (
    exists (
      select 1 from public.hospitals_directory
      where admin_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- 3. consult_threads: hospital admins can read their threads
--    (drops any prior version to avoid duplicate policies)
-- ----------------------------------------------------------------
drop policy if exists "Hospital admins can view their consult threads" on public.consult_threads;
drop policy if exists "Hospitals can view their consult threads" on public.consult_threads;
create policy "Hospital admins can view their consult threads"
  on public.consult_threads for select
  using (
    hospital_id in (
      select id from public.hospitals_directory
      where admin_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- 4. consult_messages: hospital admins can read + reply
-- ----------------------------------------------------------------
drop policy if exists "Hospital admins can view messages in their threads" on public.consult_messages;
create policy "Hospital admins can view messages in their threads"
  on public.consult_messages for select
  using (
    exists (
      select 1
      from public.consult_threads ct
      join public.hospitals_directory h on h.id = ct.hospital_id
      where ct.id = consult_messages.thread_id
        and h.admin_user_id = auth.uid()
    )
  );

drop policy if exists "Hospital admins can send provider messages" on public.consult_messages;
create policy "Hospital admins can send provider messages"
  on public.consult_messages for insert
  with check (
    sender_role = 'provider'
    and exists (
      select 1
      from public.consult_threads ct
      join public.hospitals_directory h on h.id = ct.hospital_id
      where ct.id = consult_messages.thread_id
        and h.admin_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- 5. appointments: hospital admins can read + update
-- ----------------------------------------------------------------
drop policy if exists "Hospital admins can view their appointments" on public.appointments;
create policy "Hospital admins can view their appointments"
  on public.appointments for select
  using (
    hospital_id in (
      select id from public.hospitals_directory
      where admin_user_id = auth.uid()
    )
  );

drop policy if exists "Hospital admins can update their appointments" on public.appointments;
create policy "Hospital admins can update their appointments"
  on public.appointments for update
  using (
    hospital_id in (
      select id from public.hospitals_directory
      where admin_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- 6. doctors: authenticated users can read the directory
-- ----------------------------------------------------------------
drop policy if exists "Authenticated users can view doctors" on public.doctors;
create policy "Authenticated users can view doctors"
  on public.doctors for select
  to authenticated
  using (true);

-- ----------------------------------------------------------------
-- 7. Fix appointments status constraint — include 'confirmed'
-- ----------------------------------------------------------------
alter table public.appointments
  drop constraint if exists appointments_status_check;
alter table public.appointments
  add constraint appointments_status_check
  check (status in ('scheduled', 'confirmed', 'cancelled', 'completed'));
