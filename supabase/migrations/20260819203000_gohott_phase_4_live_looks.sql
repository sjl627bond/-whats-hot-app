-- GoHott Phase 4 Live Look. REVIEW ONLY: do not apply without approval.
-- Additive: no production rows are deleted or rewritten.

alter table public.markets add column if not exists timezone text not null default 'America/New_York';

create table if not exists public.venue_hours (
  venue_id uuid not null references public.venues(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  closes_next_day boolean not null default false,
  verified_at timestamptz,
  primary key (venue_id, day_of_week)
);

create table if not exists public.live_looks (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  caption text check (caption is null or char_length(caption) <= 80),
  duration_choice text not null check (duration_choice in ('15_minutes','30_minutes','60_minutes','until_close')),
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  byte_size integer not null check (byte_size between 1 and 8388608),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  proximity_assessment text not null default 'unassessed'
    check (proximity_assessment in ('unassessed','server_assessed_nearby','server_assessed_outside')),
  distance_meters integer check (distance_meters is null or distance_meters >= 0),
  moderation_state text not null default 'uploading'
    check (moderation_state in ('uploading','approved','pending_review','rejected','removed')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  expires_at timestamptz,
  removed_at timestamptz,
  report_count integer not null default 0 check (report_count >= 0),
  check (expires_at is null or expires_at > created_at)
);
create index if not exists live_looks_active_venue_idx on public.live_looks (venue_id, published_at desc)
  where moderation_state = 'approved' and removed_at is null;
create index if not exists live_looks_user_recent_idx on public.live_looks (user_id, created_at desc);

create table if not exists public.live_look_location_evidence (
  live_look_id uuid primary key references public.live_looks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters integer not null check (accuracy_meters between 0 and 10000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists live_look_evidence_expiry_idx on public.live_look_location_evidence (expires_at);

create table if not exists public.live_look_reports (
  id uuid primary key default gen_random_uuid(),
  live_look_id uuid not null references public.live_looks(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam','unsafe','privacy','misleading','other')),
  details text check (details is null or char_length(details) <= 200),
  created_at timestamptz not null default now(),
  unique (live_look_id, reporter_user_id)
);

create table if not exists public.moderation_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.venue_hours enable row level security;
alter table public.live_looks enable row level security;
alter table public.live_look_location_evidence enable row level security;
alter table public.live_look_reports enable row level security;
alter table public.moderation_audit_log enable row level security;
revoke all on public.venue_hours, public.live_looks, public.live_look_location_evidence, public.live_look_reports, public.moderation_audit_log from anon, authenticated;
grant select on public.venue_hours to anon, authenticated;
grant select (id,venue_id,caption,duration_choice,storage_path,proximity_assessment,created_at,published_at,expires_at) on public.live_looks to anon;
grant select (id,venue_id,caption,duration_choice,storage_path,proximity_assessment,created_at,published_at,expires_at) on public.live_looks to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='venue_hours' and policyname='venue_hours_verified_read') then
    create policy venue_hours_verified_read on public.venue_hours for select to anon, authenticated using (verified_at is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='live_looks' and policyname='live_looks_active_read') then
    create policy live_looks_active_read on public.live_looks for select to anon, authenticated
      using (moderation_state='approved' and removed_at is null and published_at is not null and expires_at > now());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='live_looks' and policyname='live_looks_owner_read') then
    create policy live_looks_owner_read on public.live_looks for select to authenticated using ((select auth.uid())=user_id);
  end if;
end; $$;

create or replace function public.get_active_live_looks()
returns table(id uuid,venue_id uuid,caption text,duration_choice text,storage_path text,proximity_assessment text,created_at timestamptz,published_at timestamptz,expires_at timestamptz,is_owner boolean)
language sql stable security definer set search_path='' as $$
  select l.id,l.venue_id,l.caption,l.duration_choice,l.storage_path,l.proximity_assessment,l.created_at,l.published_at,l.expires_at,(l.user_id=(select auth.uid()))
  from public.live_looks l where l.moderation_state='approved' and l.removed_at is null and l.expires_at>now() order by l.published_at desc limit 60
$$;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('live-looks','live-looks',false,8388608,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='live_looks_owner_upload') then
    create policy live_looks_owner_upload on storage.objects for insert to authenticated with check (
      bucket_id='live-looks' and (storage.foldername(name))[1]=(select auth.uid())::text
      and exists (select 1 from public.live_looks l where l.storage_path=name and l.user_id=(select auth.uid()) and l.moderation_state='uploading')
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='live_looks_controlled_read') then
    create policy live_looks_controlled_read on storage.objects for select to anon, authenticated using (
      bucket_id='live-looks' and exists (select 1 from public.live_looks l where l.storage_path=name and ((l.moderation_state='approved' and l.removed_at is null and l.expires_at>now()) or l.user_id=(select auth.uid())))
    );
  end if;
end; $$;

create or replace function public.prepare_live_look_upload(p_venue_id uuid,p_content_type text,p_byte_size integer,p_extension text,p_content_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid:=gen_random_uuid(); v_path text;
begin
  if v_user is null then raise exception using errcode='42501',message='Sign in to add a Live Look.'; end if;
  if not exists(select 1 from auth.sessions s where s.user_id=v_user and s.id::text=auth.jwt()->>'session_id') then raise exception using errcode='42501',message='Your session is no longer active.'; end if;
  if not exists(select 1 from public.venues where id=p_venue_id) then raise exception using errcode='23503',message='Venue not found.'; end if;
  if p_content_type not in ('image/jpeg','image/png','image/webp','image/heic','image/heif') or p_byte_size not between 1 and 8388608 or p_content_hash !~ '^[a-f0-9]{64}$' then raise exception using errcode='22023',message='Invalid image.'; end if;
  if p_extension <> case p_content_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/heic' then 'heic' when 'image/heif' then 'heif' end then raise exception using errcode='22023',message='Invalid image extension.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,4));
  if (select count(*) from public.live_looks where user_id=v_user and created_at>now()-interval '1 hour')>=8 then raise exception using errcode='P0001',message='Live Look limit reached. Try again later.'; end if;
  if exists(select 1 from public.live_looks where user_id=v_user and venue_id=p_venue_id and created_at>now()-interval '5 minutes') then raise exception using errcode='P0001',message='Wait five minutes before adding another Live Look here.'; end if;
  if exists(select 1 from public.live_looks where user_id=v_user and content_hash=p_content_hash and created_at>now()-interval '24 hours') then raise exception using errcode='P0001',message='That photo was already submitted.'; end if;
  v_path:=v_user::text||'/'||v_id::text||'/original.'||p_extension;
  insert into public.live_looks(id,venue_id,user_id,storage_path,duration_choice,content_type,byte_size,content_hash) values(v_id,p_venue_id,v_user,v_path,'60_minutes',p_content_type,p_byte_size,p_content_hash);
  return jsonb_build_object('id',v_id,'path',v_path);
end; $$;

create or replace function public.publish_live_look(p_live_look_id uuid,p_caption text,p_duration_choice text,p_latitude double precision,p_longitude double precision,p_accuracy_meters integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_look public.live_looks%rowtype; v_lat float8; v_lon float8; v_distance integer; v_expiry timestamptz; v_fallback boolean:=false; v_object record; v_timezone text; v_local_now timestamp; v_close_local timestamp; v_close_time time; v_next_day boolean;
begin
  if v_user is null then raise exception using errcode='42501',message='Sign in to publish.'; end if;
  if not exists(select 1 from auth.sessions s where s.user_id=v_user and s.id::text=auth.jwt()->>'session_id') then raise exception using errcode='42501',message='Your session is no longer active.'; end if;
  if p_caption is not null and char_length(trim(p_caption))>80 then raise exception using errcode='22023',message='Caption is too long.'; end if;
  if p_duration_choice not in ('15_minutes','30_minutes','60_minutes','until_close') then raise exception using errcode='22023',message='Invalid duration.'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or p_accuracy_meters not between 0 and 10000 then raise exception using errcode='22023',message='Location is required for server assessment.'; end if;
  select * into v_look from public.live_looks where id=p_live_look_id and user_id=v_user and moderation_state='uploading' for update;
  if not found then raise exception using errcode='42501',message='Live Look upload was not found.'; end if;
  select metadata into v_object from storage.objects where bucket_id='live-looks' and name=v_look.storage_path;
  if not found or coalesce(v_object.metadata->>'mimetype','')<>v_look.content_type or coalesce((v_object.metadata->>'size')::bigint,0)<>v_look.byte_size then raise exception using errcode='22023',message='Uploaded image validation failed.'; end if;
  select latitude,longitude into v_lat,v_lon from public.venue_profiles where venue_id=v_look.venue_id and verification_status='verified';
  if v_lat is not null then v_distance:=round(6371000*2*asin(sqrt(least(1,greatest(0,power(sin(radians((v_lat-p_latitude)/2)),2)+cos(radians(p_latitude))*cos(radians(v_lat))*power(sin(radians((v_lon-p_longitude)/2)),2))))))::integer; end if;
  if v_distance is null then raise exception using errcode='P0001',message='This venue needs verified coordinates before Live Look can publish.'; end if;
  if v_distance>500 or p_accuracy_meters>250 then raise exception using errcode='P0001',message='Live Look can only publish when the server assesses the device as nearby.'; end if;
  v_expiry:=now()+case p_duration_choice when '15_minutes' then interval '15 minutes' when '30_minutes' then interval '30 minutes' else interval '60 minutes' end;
  if p_duration_choice='until_close' then
    select coalesce(m.timezone,'America/New_York') into v_timezone from public.venue_profiles vp left join public.markets m on m.id=vp.market_id where vp.venue_id=v_look.venue_id;
    v_local_now:=timezone(coalesce(v_timezone,'America/New_York'),now());
    select h.closes_at,h.closes_next_day into v_close_time,v_next_day from public.venue_hours h where h.venue_id=v_look.venue_id and h.day_of_week=extract(dow from v_local_now)::smallint and h.verified_at is not null;
    if found then v_close_local:=date_trunc('day',v_local_now)+v_close_time+case when v_next_day then interval '1 day' else interval '0' end; end if;
    if v_close_local is null or v_close_local<=v_local_now then
      select h.closes_at,h.closes_next_day into v_close_time,v_next_day from public.venue_hours h where h.venue_id=v_look.venue_id and h.day_of_week=((extract(dow from v_local_now)::integer+6)%7) and h.closes_next_day and h.verified_at is not null;
      if found then v_close_local:=date_trunc('day',v_local_now)-interval '1 day'+v_close_time+interval '1 day'; end if;
    end if;
    if v_close_local>v_local_now then v_expiry:=least(v_close_local at time zone coalesce(v_timezone,'America/New_York'),now()+interval '4 hours'); else v_expiry:=now()+interval '60 minutes'; v_fallback:=true; end if;
  end if;
  insert into public.live_look_location_evidence(live_look_id,user_id,latitude,longitude,accuracy_meters) values(v_look.id,v_user,p_latitude,p_longitude,p_accuracy_meters);
  update public.live_looks set caption=nullif(trim(p_caption),''),duration_choice=p_duration_choice,published_at=now(),expires_at=v_expiry,moderation_state='approved',proximity_assessment='server_assessed_nearby',distance_meters=v_distance where id=v_look.id;
  insert into public.moderation_audit_log(actor_user_id,entity_type,entity_id,action,metadata) values(v_user,'live_look',v_look.id,'published',jsonb_build_object('duration_fallback',v_fallback));
  return jsonb_build_object('id',v_look.id,'expires_at',v_expiry,'duration_fallback',v_fallback);
end; $$;

create or replace function public.remove_live_look(p_live_look_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); begin if v_user is null or not exists(select 1 from auth.sessions s where s.user_id=v_user and s.id::text=auth.jwt()->>'session_id') then raise exception using errcode='42501',message='Sign in again.'; end if; update public.live_looks set moderation_state='removed',removed_at=now() where id=p_live_look_id and user_id=v_user and removed_at is null; if not found then raise exception using errcode='42501',message='Live Look not found.'; end if; insert into public.moderation_audit_log(actor_user_id,entity_type,entity_id,action) values(v_user,'live_look',p_live_look_id,'owner_removed'); end; $$;

create or replace function public.report_live_look(p_live_look_id uuid,p_reason text,p_details text default null) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_count integer; begin if v_user is null or not exists(select 1 from auth.sessions s where s.user_id=v_user and s.id::text=auth.jwt()->>'session_id') then raise exception using errcode='42501',message='Sign in to report content.'; end if; if p_reason not in ('spam','unsafe','privacy','misleading','other') or char_length(coalesce(p_details,''))>200 then raise exception using errcode='22023',message='Invalid report.'; end if; insert into public.live_look_reports(live_look_id,reporter_user_id,reason,details) values(p_live_look_id,v_user,p_reason,nullif(trim(p_details),'')); update public.live_looks set report_count=report_count+1 where id=p_live_look_id returning report_count into v_count; if v_count>=3 then update public.live_looks set moderation_state='pending_review' where id=p_live_look_id and moderation_state='approved'; end if; insert into public.moderation_audit_log(actor_user_id,entity_type,entity_id,action,metadata) values(v_user,'live_look',p_live_look_id,'reported',jsonb_build_object('reason',p_reason)); end; $$;

revoke all on function public.prepare_live_look_upload(uuid,text,integer,text,text), public.publish_live_look(uuid,text,text,double precision,double precision,integer), public.remove_live_look(uuid), public.report_live_look(uuid,text,text) from public,anon;
grant execute on function public.prepare_live_look_upload(uuid,text,integer,text,text), public.publish_live_look(uuid,text,text,double precision,double precision,integer), public.remove_live_look(uuid), public.report_live_look(uuid,text,text) to authenticated;
revoke all on function public.get_active_live_looks() from public;
grant execute on function public.get_active_live_looks() to anon,authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='live_looks') then alter publication supabase_realtime add table public.live_looks; end if;
end; $$;

comment on column public.live_looks.proximity_assessment is 'Server-calculated from client-supplied device coordinates; not cryptographic proof of presence.';
comment on table public.live_look_location_evidence is 'Private precise evidence. Purge expires_at rows and orphaned Storage objects with a privileged scheduled worker.';
