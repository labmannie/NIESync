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

  if _report.status in ('resolved', 'expired') then
    raise exception 'Chat window closed';
  end if;

  if _report.status = 'email_sent' and _report.phone_revealed then
    raise exception 'Chat window closed after phone reveal';
  end if;

  if _report.status not in ('pending', 'chatting', 'acknowledged', 'email_sent') then
    raise exception 'Chat window closed';
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

grant execute on function public.parking_add_message(uuid, text) to authenticated;

