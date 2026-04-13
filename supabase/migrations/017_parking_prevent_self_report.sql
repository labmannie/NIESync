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

  with candidates as (
    select pv.profile_id as owner_id, pv.id as vehicle_id, 1 as priority
    from public.profile_vehicles pv
    where upper(regexp_replace(coalesce(pv.vehicle_no, ''), '[^A-Za-z0-9]', '', 'g')) = _normalized

    union all

    select p.id as owner_id, null::uuid as vehicle_id, 2 as priority
    from public.profiles p
    where upper(regexp_replace(coalesce(p.vehicle_no, ''), '[^A-Za-z0-9]', '', 'g')) = _normalized
  )
  select c.owner_id, c.vehicle_id
    into _owner_id, _vehicle_id
  from candidates c
  order by c.priority asc, c.owner_id asc, c.vehicle_id asc nulls last
  limit 1;

  if _owner_id = _uid then
    raise exception 'Cannot report your own vehicle';
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
    insert into public.parking_report_messages (report_id, sender_role, message)
    values (
      _report.id,
      'system',
      'This vehicle is not registered in NIE Campus Sync. The incident has been logged.'
    );
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

grant execute on function public.parking_create_report(text, text, text, text) to authenticated;

