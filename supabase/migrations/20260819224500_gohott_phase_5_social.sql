-- GoHott Phase 5 social foundation. REVIEW ONLY: do not apply without approval.
-- Additive and backward compatible; no production rows are deleted or rewritten.

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_url text check (avatar_url is null or avatar_url ~ '^https://');
alter table public.profiles add column if not exists bio text check (bio is null or char_length(bio) <= 160);
alter table public.profiles add column if not exists favorite_categories text[] not null default '{}';
alter table public.profiles add column if not exists social_links jsonb not null default '{}'::jsonb check (jsonb_typeof(social_links) = 'object');
alter table public.profiles add column if not exists profile_visibility text not null default 'public' check (profile_visibility in ('public','followers','private'));
alter table public.profiles add column if not exists message_permission text not null default 'followers' check (message_permission in ('everyone','followers','mutuals','nobody'));
alter table public.profiles add column if not exists follower_visibility text not null default 'followers' check (follower_visibility in ('public','followers','private'));
alter table public.profiles add column if not exists show_social_activity boolean not null default true;
alter table public.profiles add column if not exists notification_preferences jsonb not null default '{"followers":true,"messages":true,"reactions":true,"shares":true,"plans":true,"live_looks":true}'::jsonb check (jsonb_typeof(notification_preferences) = 'object');
create unique index if not exists profiles_username_lower_uidx on public.profiles (lower(username)) where username is not null;
create index if not exists profiles_social_search_idx on public.profiles (lower(username), lower(display_name));

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'accepted' check (status in ('requested','accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_following_status_idx on public.follows (following_id,status,created_at desc);
create index if not exists follows_follower_status_idx on public.follows (follower_id,status,created_at desc);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  direct_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  muted boolean not null default false,
  primary key (conversation_id,user_id)
);
create index if not exists conversation_participants_user_idx on public.conversation_participants (user_id,conversation_id);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  removed_at timestamptz
);
create index if not exists messages_conversation_recent_idx on public.messages (conversation_id,created_at desc,id);
create table if not exists public.message_references (
  message_id uuid primary key references public.messages(id) on delete cascade,
  reference_type text not null check (reference_type in ('venue','profile','live_look','plan')),
  reference_id uuid not null,
  label text check (label is null or char_length(label) <= 120)
);

create table if not exists public.nightlife_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  plan_date date not null default current_date,
  status text not null check (status in ('going','maybe','interested')),
  visibility text not null default 'followers' check (visibility in ('private','followers','mutuals','public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,venue_id,plan_date)
);
create index if not exists nightlife_plans_venue_date_idx on public.nightlife_plans (venue_id,plan_date,status);
create index if not exists nightlife_plans_user_recent_idx on public.nightlife_plans (user_id,plan_date desc);

create table if not exists public.live_look_reactions (
  live_look_id uuid not null references public.live_looks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('fire','love','vibe')),
  created_at timestamptz not null default now(),
  primary key (live_look_id,user_id)
);
create index if not exists live_look_reactions_look_idx on public.live_look_reactions (live_look_id,reaction);

create table if not exists public.social_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  notification_type text not null check (notification_type in ('follow','follow_request','message','reaction','share','live_look','plan')),
  entity_type text check (entity_type is null or entity_type in ('profile','conversation','message','venue','live_look','plan')),
  entity_id uuid,
  summary text not null check (char_length(summary) <= 160),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists social_notifications_unread_idx on public.social_notifications (recipient_id,created_at desc) where read_at is null;

create table if not exists public.social_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('profile','message','plan','reaction')),
  target_id uuid not null,
  reason text not null check (reason in ('spam','harassment','impersonation','privacy','unsafe','other')),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'pending' check (status in ('pending','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id,target_type,target_id)
);
create index if not exists social_reports_pending_idx on public.social_reports (status,created_at) where status in ('pending','reviewing');

alter table public.user_blocks enable row level security;
alter table public.follows enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_references enable row level security;
alter table public.nightlife_plans enable row level security;
alter table public.live_look_reactions enable row level security;
alter table public.social_notifications enable row level security;
alter table public.social_reports enable row level security;

revoke all on public.user_blocks,public.follows,public.conversations,public.conversation_participants,public.messages,public.message_references,public.nightlife_plans,public.live_look_reactions,public.social_notifications,public.social_reports from anon,authenticated;
grant select on public.follows,public.conversations,public.conversation_participants,public.messages,public.message_references,public.nightlife_plans to authenticated;
grant select,update (read_at) on public.social_notifications to authenticated;

create or replace function public.social_block_exists(p_other uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_blocks b where (b.blocker_id=(select auth.uid()) and b.blocked_id=p_other) or (b.blocker_id=p_other and b.blocked_id=(select auth.uid())))
$$;
revoke all on function public.social_block_exists(uuid) from public,anon;
grant execute on function public.social_block_exists(uuid) to authenticated;

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.conversation_participants cp where cp.conversation_id=p_conversation_id and cp.user_id=(select auth.uid()))
$$;
revoke all on function public.is_conversation_member(uuid) from public,anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;

do $$ begin
  create policy blocks_own_read on public.user_blocks for select to authenticated using ((select auth.uid()) in (blocker_id,blocked_id));
  create policy follows_party_read on public.follows for select to authenticated using ((select auth.uid()) in (follower_id,following_id));
  create policy conversations_member_read on public.conversations for select to authenticated using (public.is_conversation_member(id));
  create policy participants_member_read on public.conversation_participants for select to authenticated using (public.is_conversation_member(conversation_id));
  create policy messages_member_read on public.messages for select to authenticated using (public.is_conversation_member(conversation_id) and removed_at is null);
  create policy references_member_read on public.message_references for select to authenticated using (exists(select 1 from public.messages m where m.id=message_id and public.is_conversation_member(m.conversation_id) and m.removed_at is null));
  create policy plans_owner_read on public.nightlife_plans for select to authenticated using ((select auth.uid())=user_id);
  create policy notifications_own_read on public.social_notifications for select to authenticated using ((select auth.uid())=recipient_id);
  create policy notifications_own_update on public.social_notifications for update to authenticated using ((select auth.uid())=recipient_id) with check ((select auth.uid())=recipient_id);
end; $$;

create or replace function public.require_active_social_session()
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not exists(select 1 from auth.sessions s where s.user_id=v_user and s.id::text=auth.jwt()->>'session_id') then
    raise exception using errcode='42501',message='Sign in again.';
  end if;
  return v_user;
end; $$;
revoke all on function public.require_active_social_session() from public,anon,authenticated;

create or replace function public.set_follow_state(p_target uuid,p_follow boolean)
returns text language plpgsql security definer set search_path='' as $$
declare v_user uuid := public.require_active_social_session(); v_status text;
begin
  if p_target=v_user or public.social_block_exists(p_target) then raise exception using errcode='42501',message='This account cannot be followed.'; end if;
  if not p_follow then delete from public.follows where follower_id=v_user and following_id=p_target; return 'not_following'; end if;
  select case when profile_visibility='private' then 'requested' else 'accepted' end into v_status from public.profiles where id=p_target;
  if v_status is null then raise exception using errcode='23503',message='Profile not found.'; end if;
  insert into public.follows(follower_id,following_id,status,accepted_at) values(v_user,p_target,v_status,case when v_status='accepted' then now() end)
    on conflict(follower_id,following_id) do update set status=excluded.status,accepted_at=excluded.accepted_at;
  if v_status='accepted' then insert into public.social_notifications(recipient_id,actor_id,notification_type,entity_type,entity_id,summary) values(p_target,v_user,'follow','profile',v_user,'New follower') on conflict do nothing; end if;
  return v_status;
end; $$;

create or replace function public.set_user_block(p_target uuid,p_block boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid := public.require_active_social_session();
begin
  if p_target=v_user then raise exception using errcode='22023',message='You cannot block yourself.'; end if;
  if p_block then
    insert into public.user_blocks(blocker_id,blocked_id) values(v_user,p_target) on conflict do nothing;
    delete from public.follows where (follower_id=v_user and following_id=p_target) or (follower_id=p_target and following_id=v_user);
  else delete from public.user_blocks where blocker_id=v_user and blocked_id=p_target;
  end if;
end; $$;

create or replace function public.search_social_profiles(p_query text default '',p_limit integer default 20)
returns table(id uuid,username text,display_name text,avatar_url text,bio text,home_city text,follower_count bigint,following_count bigint,is_following boolean,is_mutual boolean)
language sql stable security definer set search_path='' as $$
  select p.id,p.username,p.display_name,p.avatar_url,p.bio,p.home_city,
    (select count(*) from public.follows f where f.following_id=p.id and f.status='accepted'),
    (select count(*) from public.follows f where f.follower_id=p.id and f.status='accepted'),
    exists(select 1 from public.follows f where f.follower_id=(select auth.uid()) and f.following_id=p.id and f.status='accepted'),
    exists(select 1 from public.follows a join public.follows b on b.follower_id=a.following_id and b.following_id=a.follower_id where a.follower_id=(select auth.uid()) and a.following_id=p.id and a.status='accepted' and b.status='accepted')
  from public.profiles p
  where public.require_active_social_session() is not null and p.id<>(select auth.uid()) and not public.social_block_exists(p.id)
    and p.profile_visibility<>'private' and (coalesce(p_query,'')='' or p.username ilike '%'||p_query||'%' or p.display_name ilike '%'||p_query||'%')
  order by (p.home_city=(select me.home_city from public.profiles me where me.id=(select auth.uid()))) desc,p.updated_at desc limit least(greatest(p_limit,1),50)
$$;

create or replace function public.list_social_connections(p_kind text)
returns table(id uuid,username text,display_name text,avatar_url text,home_city text,is_following boolean,is_mutual boolean)
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid := public.require_active_social_session();
begin
  if p_kind not in ('followers','following') then raise exception using errcode='22023',message='Invalid connection list.'; end if;
  return query
    select p.id,p.username,p.display_name,p.avatar_url,p.home_city,
      exists(select 1 from public.follows a where a.follower_id=v_user and a.following_id=p.id and a.status='accepted'),
      exists(select 1 from public.follows a where a.follower_id=v_user and a.following_id=p.id and a.status='accepted')
      and exists(select 1 from public.follows b where b.follower_id=p.id and b.following_id=v_user and b.status='accepted')
    from public.follows f join public.profiles p on p.id=case when p_kind='followers' then f.follower_id else f.following_id end
    where f.status='accepted' and (case when p_kind='followers' then f.following_id=v_user else f.follower_id=v_user end)
      and not public.social_block_exists(p.id)
    order by f.created_at desc limit 200;
end; $$;

create or replace function public.start_direct_conversation(p_target uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid := public.require_active_social_session(); v_key text; v_id uuid; v_permission text;
begin
  if p_target=v_user or public.social_block_exists(p_target) then raise exception using errcode='42501',message='Messaging is not available.'; end if;
  select message_permission into v_permission from public.profiles where id=p_target;
  if v_permission='nobody' or (v_permission='followers' and not exists(select 1 from public.follows where follower_id=p_target and following_id=v_user and status='accepted')) or (v_permission='mutuals' and not (exists(select 1 from public.follows where follower_id=p_target and following_id=v_user and status='accepted') and exists(select 1 from public.follows where follower_id=v_user and following_id=p_target and status='accepted'))) then raise exception using errcode='42501',message='This person is not accepting messages from you.'; end if;
  v_key:=least(v_user::text,p_target::text)||':'||greatest(v_user::text,p_target::text);
  insert into public.conversations(direct_key) values(v_key) on conflict(direct_key) do update set direct_key=excluded.direct_key returning id into v_id;
  insert into public.conversation_participants(conversation_id,user_id) values(v_id,v_user),(v_id,p_target) on conflict do nothing;
  return v_id;
end; $$;

create or replace function public.send_social_message(p_conversation uuid,p_body text,p_reference_type text default null,p_reference_id uuid default null,p_label text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid := public.require_active_social_session(); v_other uuid; v_id uuid;
begin
  if char_length(trim(coalesce(p_body,''))) not between 1 and 2000 or (p_reference_type is null)<>(p_reference_id is null) or (p_reference_type is not null and p_reference_type not in ('venue','profile','live_look','plan')) then raise exception using errcode='22023',message='Invalid message.'; end if;
  if not public.is_conversation_member(p_conversation) then raise exception using errcode='42501',message='Conversation unavailable.'; end if;
  select user_id into v_other from public.conversation_participants where conversation_id=p_conversation and user_id<>v_user;
  if v_other is null or public.social_block_exists(v_other) then raise exception using errcode='42501',message='Messaging is not available.'; end if;
  if exists(select 1 from public.messages where sender_id=v_user and created_at>now()-interval '2 seconds') or (select count(*) from public.messages where sender_id=v_user and created_at>now()-interval '1 minute')>=20 then raise exception using errcode='P0001',message='Please wait before sending more messages.'; end if;
  insert into public.messages(conversation_id,sender_id,body) values(p_conversation,v_user,trim(p_body)) returning id into v_id;
  if p_reference_type is not null then insert into public.message_references(message_id,reference_type,reference_id,label) values(v_id,p_reference_type,p_reference_id,left(p_label,120)); end if;
  update public.conversations set updated_at=now() where id=p_conversation;
  insert into public.social_notifications(recipient_id,actor_id,notification_type,entity_type,entity_id,summary) values(v_other,v_user,'message','conversation',p_conversation,'New message');
  return v_id;
end; $$;

create or replace function public.set_nightlife_plan(p_venue uuid,p_status text,p_visibility text,p_date date default current_date)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid := public.require_active_social_session(); v_id uuid;
begin
  if p_status not in ('going','maybe','interested') or p_visibility not in ('private','followers','mutuals','public') or p_date not between current_date and current_date+90 then raise exception using errcode='22023',message='Invalid nightlife plan.'; end if;
  insert into public.nightlife_plans(user_id,venue_id,status,visibility,plan_date) values(v_user,p_venue,p_status,p_visibility,p_date)
    on conflict(user_id,venue_id,plan_date) do update set status=excluded.status,visibility=excluded.visibility,updated_at=now() returning id into v_id;
  return v_id;
end; $$;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid := public.require_active_social_session();
begin
  update public.conversation_participants set last_read_at=now() where conversation_id=p_conversation and user_id=v_user;
  if not found then raise exception using errcode='42501',message='Conversation unavailable.'; end if;
end; $$;

create or replace function public.get_venue_plan_signal(p_venue uuid,p_date date default current_date)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('following_count',count(*),'summary',case when count(*)=0 then null else count(*)||' people you follow are thinking about going.' end)
  from public.nightlife_plans np join public.follows f on f.following_id=np.user_id and f.follower_id=(select auth.uid()) and f.status='accepted'
  where public.require_active_social_session() is not null and np.venue_id=p_venue and np.plan_date=p_date and not public.social_block_exists(np.user_id)
    and (np.visibility='public' or np.visibility='followers' or (np.visibility='mutuals' and exists(select 1 from public.follows r where r.follower_id=np.user_id and r.following_id=(select auth.uid()) and r.status='accepted')))
$$;

create or replace function public.set_live_look_reaction(p_live_look uuid,p_reaction text)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_user uuid := public.require_active_social_session(); v_owner uuid; v_count bigint;
begin
  if p_reaction not in ('fire','love','vibe') then raise exception using errcode='22023',message='Invalid reaction.'; end if;
  select user_id into v_owner from public.live_looks where id=p_live_look and moderation_state='approved' and removed_at is null and expires_at>now();
  if v_owner is null or public.social_block_exists(v_owner) then raise exception using errcode='42501',message='Live Look unavailable.'; end if;
  insert into public.live_look_reactions(live_look_id,user_id,reaction) values(p_live_look,v_user,p_reaction) on conflict(live_look_id,user_id) do update set reaction=excluded.reaction,created_at=now();
  if v_owner<>v_user then insert into public.social_notifications(recipient_id,actor_id,notification_type,entity_type,entity_id,summary) values(v_owner,v_user,'reaction','live_look',p_live_look,'New Live Look reaction'); end if;
  select count(*) into v_count from public.live_look_reactions where live_look_id=p_live_look; return v_count;
end; $$;

create or replace function public.report_social_content(p_target_type text,p_target_id uuid,p_reason text,p_details text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid := public.require_active_social_session(); v_id uuid;
begin
  if p_target_type not in ('profile','message','plan','reaction') or p_reason not in ('spam','harassment','impersonation','privacy','unsafe','other') or char_length(coalesce(p_details,''))>500 then raise exception using errcode='22023',message='Invalid report.'; end if;
  insert into public.social_reports(reporter_id,target_type,target_id,reason,details) values(v_user,p_target_type,p_target_id,p_reason,nullif(trim(p_details),'')) returning id into v_id; return v_id;
end; $$;

revoke all on function public.set_follow_state(uuid,boolean),public.set_user_block(uuid,boolean),public.search_social_profiles(text,integer),public.list_social_connections(text),public.start_direct_conversation(uuid),public.send_social_message(uuid,text,text,uuid,text),public.mark_conversation_read(uuid),public.set_nightlife_plan(uuid,text,text,date),public.get_venue_plan_signal(uuid,date),public.set_live_look_reaction(uuid,text),public.report_social_content(text,uuid,text,text) from public,anon;
grant execute on function public.set_follow_state(uuid,boolean),public.set_user_block(uuid,boolean),public.search_social_profiles(text,integer),public.list_social_connections(text),public.start_direct_conversation(uuid),public.send_social_message(uuid,text,text,uuid,text),public.mark_conversation_read(uuid),public.set_nightlife_plan(uuid,text,text,date),public.get_venue_plan_signal(uuid,date),public.set_live_look_reaction(uuid,text),public.report_social_content(text,uuid,text,text) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then alter publication supabase_realtime add table public.messages; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='social_notifications') then alter publication supabase_realtime add table public.social_notifications; end if;
end; $$;

comment on table public.nightlife_plans is 'Intent only. Never infer or publish current physical presence.';
comment on table public.messages is 'Private one-to-one messages readable only by conversation participants through RLS.';
