create table if not exists public.profile_vehicles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_no text not null,
  vehicle_type text,
  vehicle_brand_model text,
  vehicle_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(vehicle_no)) > 0)
);

create index if not exists idx_profile_vehicles_profile_created
  on public.profile_vehicles (profile_id, created_at desc);

create index if not exists idx_profile_vehicles_plate_lookup
  on public.profile_vehicles (upper(regexp_replace(coalesce(vehicle_no, ''), '[^A-Za-z0-9]', '', 'g')));

alter table public.profile_vehicles enable row level security;

drop policy if exists profile_vehicles_select_own on public.profile_vehicles;
create policy profile_vehicles_select_own
on public.profile_vehicles
for select
using (profile_id = auth.uid());

drop policy if exists profile_vehicles_insert_own on public.profile_vehicles;
create policy profile_vehicles_insert_own
on public.profile_vehicles
for insert
with check (profile_id = auth.uid());

drop policy if exists profile_vehicles_update_own on public.profile_vehicles;
create policy profile_vehicles_update_own
on public.profile_vehicles
for update
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists profile_vehicles_delete_own on public.profile_vehicles;
create policy profile_vehicles_delete_own
on public.profile_vehicles
for delete
using (profile_id = auth.uid());

grant select, insert, update, delete on public.profile_vehicles to authenticated;

create or replace function public.parking_create_report(
  _license_plate text,
  _location_description text,
  _photo_url text default null,
  _ocr_raw_text text default null
) returns public.parking_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _normalized text := upper(regexp_replace(coalesce(_license_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  _owner_id uuid;
  _vehicle_id uuid;
  _owner_match_count integer := 0;
  _report public.parking_reports;
begin
  if _uid is null then
    raise exception 'Unauthorized';
  end if;

  if length(trim(coalesce(_location_description, ''))) = 0 then
    raise exception 'Location description is required';
  end if;

  if length(_normalized) < 6 or length(_normalized) > 14 then
    raise exception 'Invalid plate';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_uid::text, 41));
  perform pg_advisory_xact_lock(hashtextextended(_normalized, 43));

  if (
    select count(*)
    from public.parking_reports
    where reported_by = _uid
      and created_at >= now() - interval '2 hours'
  ) >= 3 then
    raise exception 'Rate limit exceeded: max 3 reports in 2 hours';
  end if;

  if (
    select count(*)
    from public.parking_reports
    where plate_normalized = _normalized
      and created_at >= now() - interval '24 hours'
  ) >= 2 then
    raise exception 'Rate limit exceeded: max 2 reports per plate in 24 hours';
  end if;

  if exists (
    select 1
    from public.parking_reports
    where reported_by = _uid
      and status in ('pending', 'chatting', 'acknowledged', 'email_sent')
  ) then
    raise exception 'You already have an open parking report';
  end if;

  select count(distinct owner_id)
    into _owner_match_count
  from (
    select pv.profile_id as owner_id
    from public.profile_vehicles pv
    where upper(regexp_replace(coalesce(pv.vehicle_no, ''), '[^A-Za-z0-9]', '', 'g')) = _normalized
    union all
    select p.id as owner_id
    from public.profiles p
    where upper(regexp_replace(coalesce(p.vehicle_no, ''), '[^A-Za-z0-9]', '', 'g')) = _normalized
  ) as owner_candidates;

  if _owner_match_count = 1 then
    with candidates as (
      select pv.profile_id as owner_id, pv.id as vehicle_id, 1 as priority
      from public.profile_vehicles pv
      where upper(regexp_replace(coalesce(pv.vehicle_no, ''), '[^A-Za-z0-9]', '', 'g')) = _normalized
      union all
      select p.id as owner_id, null::uuid as vehicle_id, 2 as priority
      from public.profiles p
      where upper(regexp_replace(coalesce(p.vehicle_no, ''), '[^A-Za-z0-9]', '', 'g')) = _normalized
    )
    select owner_id, vehicle_id
      into _owner_id, _vehicle_id
    from candidates
    order by priority asc
    limit 1;
  else
    _owner_id := null;
    _vehicle_id := null;
  end if;

  insert into public.parking_reports (
    reported_by,
    license_plate,
    ocr_raw_text,
    photo_url,
    location_description,
    matched_owner_id,
    matched_vehicle_id,
    status
  )
  values (
    _uid,
    _license_plate,
    _ocr_raw_text,
    _photo_url,
    _location_description,
    _owner_id,
    _vehicle_id,
    case when _owner_id is null then 'unmatched' else 'pending' end
  )
  returning *
  into _report;

  insert into public.parking_report_limits (reporter_id, report_id)
  values (_uid, _report.id);

  if _owner_id is null then
    if _owner_match_count > 1 then
      insert into public.parking_report_messages (report_id, sender_role, message)
      values (
        _report.id,
        'system',
        'This plate is linked to multiple profiles. The report is logged, and support review is required.'
      );
    else
      insert into public.parking_report_messages (report_id, sender_role, message)
      values (
        _report.id,
        'system',
        'This vehicle is not registered in NIE Campus Sync. The incident has been logged.'
      );
    end if;
  else
    insert into public.parking_report_messages (report_id, sender_role, message)
    values (
      _report.id,
      'system',
      format(
        'Your vehicle %s has been reported. Reporter note: %s. Please acknowledge and move your vehicle.',
        _report.license_plate,
        _report.location_description
      )
    );
  end if;

  return _report;
end $$;

create or replace function public.parking_reporter_mark_resolved(_report_id uuid)
returns public.parking_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _row public.parking_reports;
begin
  if _uid is null then
    raise exception 'Unauthorized';
  end if;

  update public.parking_reports
     set status = 'resolved',
         resolved_at = now()
   where id = _report_id
     and reported_by = _uid
     and (
      status = 'acknowledged'
      or (status = 'email_sent' and phone_revealed = true)
     )
  returning *
  into _row;

  if not found then
    raise exception 'Report cannot be resolved at this stage';
  end if;

  insert into public.parking_report_messages (report_id, sender_role, message)
  values (_report_id, 'system', 'Reporter marked the incident as resolved.');

  return _row;
end $$;
