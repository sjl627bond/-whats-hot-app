-- GoHott Phase 3: verified venue metadata, server-controlled check-in intake,
-- moderation signals, extensible markets, and account privacy requests.
--
-- This migration is additive and preserves every venues/check_ins row. It does
-- not backfill verification, invent venue coordinates, or delete user data.

create table if not exists public.markets (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  name text not null unique,
  center_latitude double precision not null check (center_latitude between -90 and 90),
  center_longitude double precision not null check (center_longitude between -180 and 180),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.markets (id, name, center_latitude, center_longitude)
values
  ('sarasota', 'Sarasota', 27.3364, -82.5307),
  ('tampa-bay', 'Tampa Bay', 27.9606, -82.4572)
on conflict (id) do nothing;

create table if not exists public.venue_profiles (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  market_id text references public.markets(id),
  address text check (address is null or char_length(address) <= 240),
  categories text[] not null default '{}',
  hours jsonb not null default '{}'::jsonb check (jsonb_typeof(hours) = 'object'),
  website_url text check (website_url is null or website_url ~ '^https://'),
  social_url text check (social_url is null or social_url ~ '^https://'),
  photo_urls text[] not null default '{}',
  source_urls text[] not null default '{}',
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'suspended')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (
    verification_status <> 'verified'
    or (latitude is not null and longitude is not null and verified_at is not null)
  )
);

create index if not exists venue_profiles_market_verified_idx
  on public.venue_profiles (market_id, verification_status, venue_id);

create table if not exists public.venue_claim_requests (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  evidence_url text check (evidence_url is null or evidence_url ~ '^https://'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (venue_id, user_id)
);

create table if not exists public.account_deletion_requests (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'cancelled')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.check_ins add column if not exists trust_tier text not null default 'legacy'
  check (trust_tier in ('legacy', 'accepted_unverified', 'server_assessed_nearby', 'suspicious'));
alter table public.check_ins add column if not exists server_distance_meters integer
  check (server_distance_meters is null or server_distance_meters >= 0);
alter table public.check_ins add column if not exists submitted_accuracy_meters integer
  check (submitted_accuracy_meters is null or submitted_accuracy_meters between 0 and 10000);
alter table public.check_ins add column if not exists moderation_state text not null default 'unreviewed'
  check (moderation_state in ('unreviewed', 'clear', 'flagged', 'reviewed'));

create index if not exists check_ins_trusted_recent_idx
  on public.check_ins (venue_id, created_at desc)
  where trust_tier = 'server_assessed_nearby';
create index if not exists check_ins_user_recent_idx
  on public.check_ins (user_id, created_at desc)
  where user_id is not null;

create table if not exists public.check_in_location_evidence (
  check_in_id uuid primary key references public.check_ins(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters integer not null check (accuracy_meters between 0 and 10000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  check (expires_at > created_at)
);

create index if not exists check_in_location_evidence_user_recent_idx
  on public.check_in_location_evidence (user_id, created_at desc);
create index if not exists check_in_location_evidence_expiry_idx
  on public.check_in_location_evidence (expires_at);

create table if not exists public.check_in_moderation (
  check_in_id uuid primary key references public.check_ins(id) on delete cascade,
  risk_score smallint not null check (risk_score between 0 and 100),
  reason_codes text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'cleared', 'confirmed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

alter table public.markets enable row level security;
alter table public.venue_profiles enable row level security;
alter table public.venue_claim_requests enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.check_in_location_evidence enable row level security;
alter table public.check_in_moderation enable row level security;

revoke all on public.markets from anon, authenticated;
revoke all on public.venue_profiles from anon, authenticated;
revoke all on public.venue_claim_requests from anon, authenticated;
revoke all on public.account_deletion_requests from anon, authenticated;
revoke all on public.check_in_location_evidence from anon, authenticated;
revoke all on public.check_in_moderation from anon, authenticated;

grant select on public.markets to anon, authenticated;
grant select (
  venue_id, market_id, address, categories, hours, website_url, social_url,
  photo_urls, source_urls, latitude, longitude, verification_status, verified_at, updated_at
) on public.venue_profiles to anon, authenticated;
grant select, insert (venue_id, evidence_url) on public.venue_claim_requests to authenticated;
grant select, insert (reason) on public.account_deletion_requests to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='markets' and policyname='markets_public_read') then
    create policy markets_public_read on public.markets for select to anon, authenticated using (is_active);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='venue_profiles' and policyname='venue_profiles_verified_read') then
    create policy venue_profiles_verified_read on public.venue_profiles for select to anon, authenticated using (verification_status = 'verified');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='venue_claim_requests' and policyname='venue_claim_requests_select_own') then
    create policy venue_claim_requests_select_own on public.venue_claim_requests for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='venue_claim_requests' and policyname='venue_claim_requests_insert_own') then
    create policy venue_claim_requests_insert_own on public.venue_claim_requests for insert to authenticated
      with check ((select auth.uid()) = user_id and status = 'pending' and reviewed_at is null);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='account_deletion_requests' and policyname='account_deletion_requests_select_own') then
    create policy account_deletion_requests_select_own on public.account_deletion_requests for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='account_deletion_requests' and policyname='account_deletion_requests_insert_own') then
    create policy account_deletion_requests_insert_own on public.account_deletion_requests for insert to authenticated
      with check ((select auth.uid()) = user_id and status = 'pending' and completed_at is null);
  end if;

  -- Preserve legacy anonymous and old-client inserts, but keep every server-owned
  -- trust/moderation column outside direct browser INSERT privileges.
  if exists (select 1 from pg_policies where schemaname='public' and tablename='check_ins' and policyname='check_ins_identity_guard') then
    alter policy check_ins_identity_guard on public.check_ins to anon, authenticated
      with check (
        ((select auth.uid()) is null and user_id is null and proximity_status = 'unassessed' and distance_meters is null)
        or ((select auth.uid()) is not null and (user_id is null or (select auth.uid()) = user_id))
      );
  else
    create policy check_ins_identity_guard on public.check_ins as restrictive for insert to anon, authenticated
      with check (
        ((select auth.uid()) is null and user_id is null and proximity_status = 'unassessed' and distance_meters is null)
        or ((select auth.uid()) is not null and (user_id is null or (select auth.uid()) = user_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='check_ins' and policyname='check_ins_authenticated_legacy_insert') then
    create policy check_ins_authenticated_legacy_insert on public.check_ins for insert to authenticated
      with check (user_id is null and proximity_status = 'unassessed' and distance_meters is null);
  end if;
end $$;

revoke insert on public.check_ins from anon, authenticated;
grant insert (venue_id, crowd_level, line_minutes, vibe) on public.check_ins to anon;
grant insert (venue_id, crowd_level, line_minutes, vibe, user_id) on public.check_ins to authenticated;

create or replace function public.submit_check_in_v3(
  p_venue_id uuid,
  p_crowd_level integer,
  p_vibe text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_meters integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := auth.jwt() ->> 'session_id';
  v_check_in_id uuid;
  v_venue_latitude double precision;
  v_venue_longitude double precision;
  v_distance integer;
  v_trust_tier text := 'accepted_unverified';
  v_proximity_status text := 'unassessed';
  v_risk_score smallint := 0;
  v_reasons text[] := '{}';
  v_vibe text;
  v_previous record;
  v_previous_distance integer;
  v_elapsed_seconds double precision;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Sign in to submit an assessed check-in.';
  end if;
  if v_session_id is null or not exists (
    select 1 from auth.sessions s where s.id::text = v_session_id and s.user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Your session is no longer active. Sign in again.';
  end if;
  if p_crowd_level is null or p_crowd_level not in (1, 2, 4, 5) then
    raise exception using errcode = '22023', message = 'Invalid crowd level.';
  end if;
  v_vibe := case p_crowd_level when 5 then 'GOING OFF' when 4 then 'BUSY' when 2 then 'CHILL' when 1 then 'DEAD' end;
  if p_vibe is null or char_length(p_vibe) > 40 then
    raise exception using errcode = '22023', message = 'Invalid vibe.';
  end if;
  if not exists (select 1 from public.venues v where v.id = p_venue_id) then
    raise exception using errcode = '23503', message = 'Venue not found.';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
    or (p_accuracy_meters is null and p_latitude is not null)
    or (p_accuracy_meters is not null and p_latitude is null)
    or p_latitude not between -90 and 90
    or p_longitude not between -180 and 180
    or p_accuracy_meters not between 0 and 10000 then
    raise exception using errcode = '22023', message = 'Invalid location evidence.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  if exists (
    select 1 from public.check_ins c
    where c.user_id = v_user_id and c.venue_id = p_venue_id and c.created_at > now() - interval '10 minutes'
  ) then
    raise exception using errcode = 'P0001', message = 'You reported this venue recently. Try again in 10 minutes.';
  end if;
  if (select count(*) from public.check_ins c where c.user_id = v_user_id and c.created_at > now() - interval '15 minutes') >= 5 then
    raise exception using errcode = 'P0001', message = 'Too many reports. Try again later.';
  end if;

  select vp.latitude, vp.longitude
    into v_venue_latitude, v_venue_longitude
  from public.venue_profiles vp
  where vp.venue_id = p_venue_id and vp.verification_status = 'verified';

  if p_latitude is not null and v_venue_latitude is not null then
    v_distance := round(
      6371000 * 2 * asin(sqrt(least(1, greatest(0,
        power(sin(radians((v_venue_latitude - p_latitude) / 2)), 2)
        + cos(radians(p_latitude)) * cos(radians(v_venue_latitude))
        * power(sin(radians((v_venue_longitude - p_longitude) / 2)), 2)
      ))))
    )::integer;
    v_proximity_status := case when v_distance <= 500 then 'client_nearby' else 'client_outside_radius' end;
    if v_distance <= 500 and p_accuracy_meters <= 150 then
      v_trust_tier := 'server_assessed_nearby';
    end if;
  elsif p_latitude is null then
    v_proximity_status := 'location_unavailable';
  end if;

  if p_accuracy_meters is not null and p_accuracy_meters < 1 then
    v_risk_score := 30;
    v_reasons := array_append(v_reasons, 'implausible_accuracy');
  end if;

  if p_latitude is not null then
    select e.latitude, e.longitude, e.created_at into v_previous
    from public.check_in_location_evidence e
    where e.user_id = v_user_id
    order by e.created_at desc
    limit 1;
    if found then
      v_elapsed_seconds := extract(epoch from (now() - v_previous.created_at));
      v_previous_distance := round(
        6371000 * 2 * asin(sqrt(least(1, greatest(0,
          power(sin(radians((p_latitude - v_previous.latitude) / 2)), 2)
          + cos(radians(v_previous.latitude)) * cos(radians(p_latitude))
          * power(sin(radians((p_longitude - v_previous.longitude) / 2)), 2)
        ))))
      )::integer;
      if v_elapsed_seconds > 0 and v_previous_distance / v_elapsed_seconds > 55 then
        v_risk_score := greatest(v_risk_score, 80);
        v_reasons := array_append(v_reasons, 'implausible_travel_speed');
      end if;
    end if;
  end if;

  if v_risk_score >= 60 then
    v_trust_tier := 'suspicious';
  elsif v_risk_score > 0 then
    v_trust_tier := 'accepted_unverified';
  end if;

  insert into public.check_ins (
    venue_id, crowd_level, vibe, user_id, proximity_status, distance_meters,
    trust_tier, server_distance_meters, submitted_accuracy_meters, moderation_state
  ) values (
    p_venue_id, p_crowd_level, v_vibe, v_user_id, v_proximity_status, v_distance,
    v_trust_tier, v_distance, p_accuracy_meters,
    case when v_risk_score > 0 then 'flagged' else 'clear' end
  ) returning id into v_check_in_id;

  if p_latitude is not null then
    insert into public.check_in_location_evidence (
      check_in_id, user_id, latitude, longitude, accuracy_meters
    ) values (
      v_check_in_id, v_user_id, p_latitude, p_longitude, p_accuracy_meters
    );
  end if;

  if v_risk_score > 0 then
    insert into public.check_in_moderation (check_in_id, risk_score, reason_codes)
    values (v_check_in_id, v_risk_score, v_reasons);
  end if;

  return jsonb_build_object(
    'id', v_check_in_id,
    'trust_tier', v_trust_tier,
    'proximity_status', v_proximity_status,
    'distance_meters', v_distance
  );
end;
$$;

revoke execute on function public.submit_check_in_v3(uuid, integer, text, double precision, double precision, integer) from public, anon;
grant execute on function public.submit_check_in_v3(uuid, integer, text, double precision, double precision, integer) to authenticated;

comment on table public.venue_profiles is
  'Curated metadata. Public RLS exposes only rows explicitly verified by an administrator.';
comment on column public.check_ins.trust_tier is
  'Server-owned intake result. server_assessed_nearby means the database assessed client location evidence against administrator-verified venue coordinates; it is not cryptographic location proof.';
comment on table public.check_in_location_evidence is
  'Private coarse-lived validation evidence. Never grant browser read access or expose it in public discovery queries.';
comment on table public.account_deletion_requests is
  'User-owned deletion requests for a privileged backend worker; inserting a request does not itself delete auth.users.';
