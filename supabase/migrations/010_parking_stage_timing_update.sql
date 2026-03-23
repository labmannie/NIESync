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
      and (
        pr.phone_revealed = true
        or pr.created_at <= now() - interval '2 minutes'
      )
  );
$$;

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

  if _report.created_at <= now() - interval '1 minute' then
    raise exception 'Chat window closed after 1 minute';
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

create or replace function public.parking_reveal_phone(_report_id uuid)
returns table (phone text)
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _report public.parking_reports;
  _owner_id uuid;
begin
  if _uid is null then
    raise exception 'Unauthorized';
  end if;

  select *
    into _report
  from public.parking_reports
  where id = _report_id
    and reported_by = _uid
  for update;

  if not found then
    raise exception 'Phone reveal not yet allowed';
  end if;

  if _report.status <> 'email_sent' then
    raise exception 'Phone reveal not yet allowed';
  end if;

  if (not _report.phone_revealed) and _report.created_at > now() - interval '2 minutes' then
    raise exception 'Phone reveal not yet allowed';
  end if;

  if not _report.phone_revealed then
    update public.parking_reports
       set phone_revealed = true
     where id = _report_id
       and reported_by = _uid
       and status = 'email_sent'
       and phone_revealed = false
    returning matched_owner_id
    into _owner_id;

    if not found then
      raise exception 'Phone reveal not yet allowed';
    end if;

    insert into public.parking_report_messages (report_id, sender_role, message)
    values (_report_id, 'system', 'Phone number has been revealed to the reporter.');
  else
    _owner_id := _report.matched_owner_id;
  end if;

  return query
  select p.phone
  from public.profiles p
  where p.id = _owner_id;
end $$;

grant execute on function public.can_reveal_parking_phone(uuid, uuid) to authenticated;
grant execute on function public.parking_add_message(uuid, text) to authenticated;
grant execute on function public.parking_reveal_phone(uuid) to authenticated;
