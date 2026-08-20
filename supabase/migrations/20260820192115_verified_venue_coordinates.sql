-- GoHott verified venue coordinate foundation.
--
-- Coordinates are trusted only after a privileged server/admin workflow records
-- a verified venue profile with source evidence. Browser roles cannot call the
-- verifier or write venue profiles. Live Look's existing server-side 500-metre
-- proximity assessment remains unchanged.

alter table public.venues
  add constraint venues_coordinates_complete_check
  check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null))
  not valid;

alter table public.venues
  add constraint venues_latitude_range_check
  check (latitude is null or latitude between -90 and 90)
  not valid;

alter table public.venues
  add constraint venues_longitude_range_check
  check (longitude is null or longitude between -180 and 180)
  not valid;

create or replace function public.sync_verified_venue_coordinates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue_id uuid;
begin
  if tg_op = 'DELETE' then
    v_venue_id := old.venue_id;
  else
    v_venue_id := new.venue_id;
  end if;

  if tg_op <> 'DELETE'
    and new.verification_status = 'verified'
    and new.latitude is not null
    and new.longitude is not null then
    update public.venues
    set latitude = new.latitude,
        longitude = new.longitude
    where id = new.venue_id;
  else
    update public.venues
    set latitude = null,
        longitude = null
    where id = v_venue_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_verified_venue_coordinates() from public, anon, authenticated;

drop trigger if exists venue_profiles_sync_verified_coordinates on public.venue_profiles;
create trigger venue_profiles_sync_verified_coordinates
after insert or update of latitude, longitude, verification_status or delete
on public.venue_profiles
for each row execute function public.sync_verified_venue_coordinates();

create or replace function public.set_verified_venue_coordinates(
  p_venue_id uuid,
  p_market_id text,
  p_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_source_urls text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_venue_id is null
    or not exists (select 1 from public.venues where id = p_venue_id) then
    raise exception using errcode = '22023', message = 'A valid venue is required.';
  end if;

  if p_market_id is null
    or not exists (select 1 from public.markets where id = p_market_id and is_active) then
    raise exception using errcode = '22023', message = 'An active market is required.';
  end if;

  if nullif(trim(p_address), '') is null or char_length(p_address) > 240 then
    raise exception using errcode = '22023', message = 'A verified address is required.';
  end if;

  if p_latitude is null or p_latitude not between -90 and 90
    or p_longitude is null or p_longitude not between -180 and 180 then
    raise exception using errcode = '22023', message = 'Valid coordinates are required.';
  end if;

  if coalesce(cardinality(p_source_urls), 0) = 0
    or exists (
      select 1 from unnest(p_source_urls) as sources(source_url)
      where source_url is null or source_url !~ '^https://'
    ) then
    raise exception using errcode = '22023', message = 'At least one HTTPS verification source is required.';
  end if;

  insert into public.venue_profiles (
    venue_id, market_id, address, source_urls, latitude, longitude,
    verification_status, verified_at, verified_by, updated_at
  ) values (
    p_venue_id, p_market_id, trim(p_address), p_source_urls, p_latitude, p_longitude,
    'verified', now(), auth.uid(), now()
  )
  on conflict (venue_id) do update
  set market_id = excluded.market_id,
      address = excluded.address,
      source_urls = excluded.source_urls,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      verification_status = 'verified',
      verified_at = excluded.verified_at,
      verified_by = excluded.verified_by,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.set_verified_venue_coordinates(uuid, text, text, double precision, double precision, text[])
from public, anon, authenticated;
grant execute on function public.set_verified_venue_coordinates(uuid, text, text, double precision, double precision, text[])
to service_role;

select public.set_verified_venue_coordinates(
  'd08d55fb-1b3a-4a47-ab7b-bff1eab2c54a', 'sarasota', '1454 Main St, Sarasota, FL 34236',
  27.3363718, -82.5415571,
  array['https://brewstersfl.com/contact/', 'https://www.openstreetmap.org/way/1041230929']
);
select public.set_verified_venue_coordinates(
  'b0ec10a6-7b24-4c57-bb3b-eb549277f88a', 'sarasota', '1548 Main St, Sarasota, FL 34236',
  27.3363757, -82.5396441,
  array['https://caskalesrq.com/menu/', 'https://www.openstreetmap.org/way/1041230929']
);
select public.set_verified_venue_coordinates(
  '06e64765-87cd-490b-b813-cc0fca14213b', 'sarasota', '22 N Lemon Ave, Sarasota, FL 34236',
  27.3370420, -82.5404656,
  array['https://www.coronacigar.com/sarasota-store/', 'https://www.openstreetmap.org/way/140465687']
);
select public.set_verified_venue_coordinates(
  'facc8ad0-89b1-4d8e-8fa6-1bf05ae05154', 'sarasota', '1560 Main St, Sarasota, FL 34236',
  27.3363761, -82.5394315,
  array['https://eviesonline.com/location/evies-tavern-main-street/', 'https://www.openstreetmap.org/way/1041230929']
);
select public.set_verified_venue_coordinates(
  '8c9add6c-4c1f-48d0-be0e-20c329eefe22', 'sarasota', '1490 Main St, Sarasota, FL 34236',
  27.3362260, -82.5408044,
  array['https://www.thegatorclub.com/', 'https://www.openstreetmap.org/way/912628651']
);
select public.set_verified_venue_coordinates(
  'ab8862ca-b02a-46e8-a8e2-7a9deec6e654', 'sarasota', '1448 Main St, Sarasota, FL 34236',
  27.3363729, -82.5416627,
  array['https://www.joesonmain.com/faqs', 'https://www.openstreetmap.org/way/1041230929']
);
select public.set_verified_venue_coordinates(
  'ee68c2d4-e37c-4800-b605-c3b8d6dd72a2', 'sarasota', '1562 Main St, Sarasota, FL 34236',
  27.3363762, -82.5393927,
  array['https://eviesonline.com/location/mollys-pub/', 'https://www.openstreetmap.org/way/1041230929']
);
select public.set_verified_venue_coordinates(
  '2e4365d8-cff7-44c6-835f-a2fe7972c2b4', 'tampa-bay', '405 S Howard Ave, Tampa, FL 33606',
  27.9409176, -82.4830889,
  array['https://www.visittampabay.com/listings/macdintons-soho/9240/', 'https://www.openstreetmap.org/way/634646696']
);
select public.set_verified_venue_coordinates(
  'ad9fbd15-3fb4-4f18-8aa6-ebb8e36e75bd', 'tampa-bay', '1903 Market St, Tampa, FL 33602',
  27.9612310, -82.4640588,
  array['https://www.mbirdtampa.com/location/m-bird/', 'https://www.openstreetmap.org/way/365119114']
);
select public.set_verified_venue_coordinates(
  'ce1e3fda-e1dc-4238-bd24-4b85175622d2', 'tampa-bay', '1619 E 7th Ave, Tampa, FL 33605',
  27.9601586, -82.4408257,
  array['https://clubprana.com/contact/', 'https://www.openstreetmap.org/node/14062476594']
);
select public.set_verified_venue_coordinates(
  '98c00c9c-1008-4f9e-84d9-d182afe38378', 'tampa-bay', '2004 N 16th St, Tampa, FL 33605',
  27.9618792, -82.4418938,
  array['https://castleybor.com/', 'https://www.openstreetmap.org/way/75615709']
);
select public.set_verified_venue_coordinates(
  '9facba7f-74fe-4171-8f93-0c23b4ab9617', 'tampa-bay', '1503 E 7th Ave, Tampa, FL 33605',
  27.9600695, -82.4427636,
  array['https://www.theritzybor.com/about/', 'https://www.openstreetmap.org/way/524533368']
);
select public.set_verified_venue_coordinates(
  'ab0a97a7-4de7-404e-99a9-2467289c063a', 'tampa-bay', '1507 E 7th Ave, Tampa, FL 33605',
  27.9601744, -82.4424862,
  array['https://zodiactampa.com/', 'https://www.openstreetmap.org/node/14062804289']
);

alter table public.venues validate constraint venues_coordinates_complete_check;
alter table public.venues validate constraint venues_latitude_range_check;
alter table public.venues validate constraint venues_longitude_range_check;

comment on column public.venues.latitude is
  'Read-optimized mirror of administrator-verified venue_profiles.latitude.';
comment on column public.venues.longitude is
  'Read-optimized mirror of administrator-verified venue_profiles.longitude.';
comment on function public.set_verified_venue_coordinates(uuid, text, text, double precision, double precision, text[]) is
  'Privileged venue ingestion path. Requires valid coordinates and HTTPS source evidence; unavailable to browser roles.';
