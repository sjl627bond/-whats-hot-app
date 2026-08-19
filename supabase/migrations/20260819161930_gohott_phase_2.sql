-- GoHott Phase 2: additive identity, personalization, and client-assessed proximity fields.
-- Existing venues and check_ins rows are preserved. Apply through the Supabase
-- migration workflow after reviewing the target project's current policies.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 60),
  avatar_url text,
  home_city text check (home_city in ('Sarasota', 'Tampa Bay')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_venues (
  user_id uuid not null references auth.users(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);

alter table public.check_ins add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.check_ins add column if not exists proximity_status text not null default 'unassessed'
  check (proximity_status in ('client_nearby', 'client_outside_radius', 'unassessed', 'location_unavailable', 'location_denied'));
alter table public.check_ins add column if not exists distance_meters integer check (distance_meters is null or distance_meters >= 0);

-- Anonymous reports remain compatible, but cannot carry client-nearby metadata.
-- Authenticated client-nearby remains advisory and is not server verification.
do $$ begin
  if not exists (select 1 from pg_constraint where conname='check_ins_client_nearby_requires_user' and conrelid='public.check_ins'::regclass) then
    alter table public.check_ins add constraint check_ins_client_nearby_requires_user
      check (proximity_status <> 'client_nearby' or user_id is not null);
  end if;
end $$;

create index if not exists check_ins_user_venue_created_idx
  on public.check_ins (user_id, venue_id, created_at desc)
  where user_id is not null;
create index if not exists saved_venues_user_created_idx on public.saved_venues (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.saved_venues enable row level security;
alter table public.check_ins enable row level security;
alter table public.venues enable row level security;

revoke all on public.profiles from anon;
revoke all on public.saved_venues from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, delete on public.saved_venues to authenticated;
grant select on public.venues to anon, authenticated;
grant select, insert on public.check_ins to anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_own') then
    create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_insert_own') then
    create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_own') then
    create policy profiles_update_own on public.profiles for update to authenticated
      using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='saved_venues' and policyname='saved_venues_select_own') then
    create policy saved_venues_select_own on public.saved_venues for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='saved_venues' and policyname='saved_venues_insert_own') then
    create policy saved_venues_insert_own on public.saved_venues for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='saved_venues' and policyname='saved_venues_delete_own') then
    create policy saved_venues_delete_own on public.saved_venues for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='venues' and policyname='venues_public_read') then
    create policy venues_public_read on public.venues for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_ins' and policyname='check_ins_public_read') then
    create policy check_ins_public_read on public.check_ins for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_ins' and policyname='check_ins_anon_insert') then
    create policy check_ins_anon_insert on public.check_ins for insert to anon with check (user_id is null);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_ins' and policyname='check_ins_authenticated_insert') then
    create policy check_ins_authenticated_insert on public.check_ins for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  -- PostgreSQL ORs permissive policies. This restrictive policy is ANDed with
  -- every permissive INSERT policy, including the existing production policy.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_ins' and policyname='check_ins_identity_guard') then
    create policy check_ins_identity_guard on public.check_ins as restrictive for insert to anon, authenticated
      with check (
        ((select auth.uid()) is null and user_id is null and proximity_status = 'unassessed' and distance_meters is null)
        or ((select auth.uid()) is not null and (select auth.uid()) = user_id)
      );
  end if;
end $$;

comment on column public.check_ins.proximity_status is
  'Untrusted client assessment only; client_nearby means the signed-in browser calculated <= 500m. It is not server-verified.';
