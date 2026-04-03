-- Allow authenticated users to create their own profile row
-- and backfill missing profile rows for existing auth users.

-- 1) Add insert policy (id must match auth.uid())
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can insert their own profile'
  ) then
    create policy "Users can insert their own profile"
      on public.profiles for insert
      with check (auth.uid() = id);
  end if;
end $$;

-- 2) Backfill profile rows for any existing users that don't have one yet
insert into public.profiles (id, phone)
select u.id, u.phone
from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
);
