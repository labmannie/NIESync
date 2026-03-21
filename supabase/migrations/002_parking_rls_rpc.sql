alter table public.parking_reports enable row level security;
alter table public.parking_report_messages enable row level security;
alter table public.parking_report_limits enable row level security;

drop policy if exists parking_reports_select_party on public.parking_reports;
create policy parking_reports_select_party
on public.parking_reports
for select
using (reported_by = auth.uid() or matched_owner_id = auth.uid());

drop policy if exists parking_messages_select_party on public.parking_report_messages;
create policy parking_messages_select_party
on public.parking_report_messages
for select
using (
  exists (
    select 1
    from public.parking_reports pr
    where pr.id = parking_report_messages.report_id
      and (pr.reported_by = auth.uid() or pr.matched_owner_id = auth.uid())
  )
);

drop policy if exists parking_messages_insert_party on public.parking_report_messages;
create policy parking_messages_insert_party
on public.parking_report_messages
for insert
with check (
  exists (
    select 1
    from public.parking_reports pr
    where pr.id = parking_report_messages.report_id
      and (pr.reported_by = auth.uid() or pr.matched_owner_id = auth.uid())
  )
);

drop policy if exists parking_limits_select_own on public.parking_report_limits;
create policy parking_limits_select_own
on public.parking_report_limits
for select
using (reporter_id = auth.uid());

grant select on public.parking_reports to authenticated;
grant select on public.parking_report_messages to authenticated;
grant select on public.parking_report_limits to authenticated;

revoke insert, update, delete on public.parking_reports from anon, authenticated;
revoke insert, update, delete on public.parking_report_messages from anon, authenticated;
revoke insert, update, delete on public.parking_report_limits from anon, authenticated;

create or replace function public.can_reveal_parking_phone(_report_id uuid, _uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.parking_reports pr
    where pr.id = _report_id
      and pr.reported_by = _uid
      and pr.status = 'email_sent'
      and pr.created_at <= now() - interval '5 minutes'
  );
$$;

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
    select p.id as owner_id, null::uuid as vehicle_id
    from public.profiles p
    where upper(regexp_replace(coalesce(p.vehicle_no, ''), '[^A-Za-z0-9]', '', 'g')) = _normalized
    union all
    select pv.profile_id as owner_id, pv.id as vehicle_id
    from public.profile_vehicles pv
    where upper(regexp_replace(coalesce(pv.vehicle_no, ''), '[^A-Za-z0-9]', '', 'g')) = _normalized
  )
  select owner_id, vehicle_id
    into _owner_id, _vehicle_id
  from candidates
  limit 1;

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
        'Your vehicle %s is reported as blocking movement near %s. Please acknowledge and move your vehicle.',
        _report.license_plate,
        _report.location_description
      )
    );
  end if;

  return _report;
end $$;

create or replace function public.parking_add_message(
  _report_id uuid,
  _message text
) returns public.parking_report_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _report public.parking_reports;
  _role text;
  _row public.parking_report_messages;
begin
  if _uid is null then
    raise exception 'Unauthorized';
  end if;

  if length(trim(coalesce(_message, ''))) = 0 then
    raise exception 'Message cannot be empty';
  end if;

  select *
    into _report
  from public.parking_reports
  where id = _report_id;

  if not found then
    raise exception 'Report not found';
  end if;

  if _report.status = 'unmatched' then
    raise exception 'Chat is disabled for unmatched reports';
  end if;

  if _report.status not in ('pending', 'chatting') then
    raise exception 'Chat window closed';
  end if;

  if _report.created_at <= now() - interval '2 minutes' then
    raise exception 'Chat window closed after 2 minutes';
  end if;

  if _report.reported_by = _uid then
    _role := 'reporter';
  elsif _report.matched_owner_id = _uid then
    _role := 'owner';
  else
    raise exception 'Forbidden';
  end if;

  insert into public.parking_report_messages (report_id, sender_id, sender_role, message)
  values (_report_id, _uid, _role, _message)
  returning *
  into _row;

  if _report.status = 'pending' and _role = 'owner' then
    update public.parking_reports
       set status = 'chatting'
     where id = _report_id;
  end if;

  return _row;
end $$;

create or replace function public.parking_owner_im_moving(_report_id uuid)
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
     set status = 'acknowledged'
   where id = _report_id
     and matched_owner_id = _uid
     and status in ('pending', 'chatting', 'email_sent')
  returning *
  into _row;

  if not found then
    raise exception 'Report not actionable by owner';
  end if;

  insert into public.parking_report_messages (report_id, sender_role, message)
  values (_report_id, 'system', 'Owner has acknowledged and is moving the vehicle.');

  return _row;
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
     and status = 'acknowledged'
  returning *
  into _row;

  if not found then
    raise exception 'Report cannot be resolved at this stage';
  end if;

  insert into public.parking_report_messages (report_id, sender_role, message)
  values (_report_id, 'system', 'Reporter marked the incident as resolved.');

  return _row;
end $$;

create or replace function public.parking_reveal_phone(_report_id uuid)
returns table (phone text)
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _owner_id uuid;
begin
  if _uid is null then
    raise exception 'Unauthorized';
  end if;

  if not public.can_reveal_parking_phone(_report_id, _uid) then
    raise exception 'Phone reveal not yet allowed';
  end if;

  update public.parking_reports
     set phone_revealed = true
   where id = _report_id
     and reported_by = _uid
     and status = 'email_sent'
  returning matched_owner_id
  into _owner_id;

  if not found then
    raise exception 'Phone reveal not yet allowed';
  end if;

  insert into public.parking_report_messages (report_id, sender_role, message)
  values (_report_id, 'system', 'Phone number has been revealed to the reporter.');

  return query
  select p.phone
  from public.profiles p
  where p.id = _owner_id;
end $$;

create or replace function public.parking_resolve_by_token(
  _report_id uuid,
  _token uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.parking_reports
     set status = 'resolved',
         resolved_at = now()
   where id = _report_id
     and resolve_token = _token
     and status in ('pending', 'chatting', 'acknowledged', 'email_sent');

  if found then
    insert into public.parking_report_messages (report_id, sender_role, message)
    values (_report_id, 'system', 'Owner resolved via email link.');
    return true;
  end if;

  return false;
end $$;

grant execute on function public.can_reveal_parking_phone(uuid, uuid) to authenticated;
grant execute on function public.parking_create_report(text, text, text, text) to authenticated;
grant execute on function public.parking_add_message(uuid, text) to authenticated;
grant execute on function public.parking_owner_im_moving(uuid) to authenticated;
grant execute on function public.parking_reporter_mark_resolved(uuid) to authenticated;
grant execute on function public.parking_reveal_phone(uuid) to authenticated;
grant execute on function public.parking_resolve_by_token(uuid, uuid) to anon, authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.parking_reports;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.parking_report_messages;
  exception
    when duplicate_object then null;
  end;
end $$;
