-- Correct the Phase 4 SECURITY INVOKER ownership check without exposing live_looks.user_id.
-- Additive function-only correction; no rows or existing table structures are modified.

create or replace function public.live_look_access_for_current_user(p_live_look_id uuid)
returns table(is_active boolean,is_owner boolean)
language sql stable security definer set search_path='' as $$
  select
    l.moderation_state='approved' and l.removed_at is null and l.published_at is not null and l.expires_at>now(),
    coalesce(l.user_id = (select auth.uid()),false)
  from public.live_looks l
  where l.id = p_live_look_id
$$;
revoke all on function public.live_look_access_for_current_user(uuid) from public, anon, authenticated;
grant execute on function public.live_look_access_for_current_user(uuid) to anon, authenticated;

create or replace function public.get_active_live_looks()
returns table(id uuid,venue_id uuid,caption text,duration_choice text,storage_path text,proximity_assessment text,created_at timestamptz,published_at timestamptz,expires_at timestamptz,is_owner boolean)
language sql stable security invoker set search_path='' as $$
  select l.id,l.venue_id,l.caption,l.duration_choice,l.storage_path,l.proximity_assessment,l.created_at,l.published_at,l.expires_at,
    access.is_owner
  from public.live_looks l
  cross join lateral public.live_look_access_for_current_user(l.id) access
  where access.is_active
  order by l.published_at desc
  limit 60
$$;
revoke all on function public.get_active_live_looks() from public;
grant execute on function public.get_active_live_looks() to anon, authenticated;

revoke select(user_id) on public.live_looks from anon, authenticated;
revoke select(moderation_state,removed_at) on public.live_looks from anon, authenticated;
