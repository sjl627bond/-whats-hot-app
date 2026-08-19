-- Phase 6 launch-readiness foundation. Additive and review-only; do not apply without approval.
create table if not exists public.user_data_export_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','ready','completed','failed','cancelled')),
  requested_at timestamptz not null default now(), completed_at timestamptz
);
create index if not exists user_data_export_requests_user_recent_idx on public.user_data_export_requests(user_id,requested_at desc);
create unique index if not exists user_data_export_requests_active_idx on public.user_data_export_requests(user_id) where status in ('pending','processing','ready');
alter table public.user_data_export_requests enable row level security;
create policy "users read own export requests" on public.user_data_export_requests for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.user_data_export_requests from anon, authenticated;
grant select on public.user_data_export_requests to authenticated;

create table if not exists public.push_notification_devices (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios','web')), token_hash text not null check (length(token_hash) between 32 and 128),
  preferences jsonb not null default '{"social":true,"messages":true,"plans":true}'::jsonb,
  enabled boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,token_hash)
);
create index if not exists push_notification_devices_user_idx on public.push_notification_devices(user_id) where enabled;
alter table public.push_notification_devices enable row level security;
revoke all on public.push_notification_devices from anon, authenticated;

create table if not exists public.client_error_reports (
  id bigint generated always as identity primary key, user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('error','unhandledrejection')), message text not null check (length(message)<=300),
  route text check (length(route)<=100), release text check (length(release)<=64), occurred_at timestamptz not null, received_at timestamptz not null default now()
);
create index if not exists client_error_reports_recent_idx on public.client_error_reports(received_at desc);
alter table public.client_error_reports enable row level security;
revoke all on public.client_error_reports from anon, authenticated;

create or replace function public.request_user_data_export() returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid := public.require_active_social_session(); v_id uuid;
begin
  select id into v_id from public.user_data_export_requests where user_id=v_user and status in ('pending','processing','ready') order by requested_at desc limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.user_data_export_requests(user_id) values(v_user) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.request_user_data_export() from public, anon;
grant execute on function public.request_user_data_export() to authenticated;

comment on table public.push_notification_devices is 'Private delivery registry. Store only server-hashed APNs/Web Push tokens; raw tokens belong in a secret backend store.';
comment on table public.client_error_reports is 'Sanitized, privacy-minimized telemetry. Privileged workers enforce retention; browsers have no table grants.';
