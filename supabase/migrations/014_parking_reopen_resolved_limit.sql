create or replace function public.parking_reporter_mark_unresolved(_report_id uuid)
returns public.parking_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _row public.parking_reports;
  _reopen_count integer := 0;
begin
  if _uid is null then
    raise exception 'Unauthorized';
  end if;

  -- Path A: unresolved after acknowledgement (existing 5-minute rule)
  update public.parking_reports
     set status = 'email_sent',
         email_sent_at = now(),
         email_dispatch_started_at = null,
         resolved_at = null,
         phone_revealed = false,
         phone_revealed_at = null
   where id = _report_id
     and reported_by = _uid
     and status = 'acknowledged'
     and acknowledged_at is not null
     and acknowledged_at <= now() - interval '5 minutes'
  returning *
  into _row;

  if found then
    insert into public.parking_report_messages (report_id, sender_role, message)
    values (
      _report_id,
      'system',
      'Reporter marked unresolved after acknowledgement. Escalation has been reopened.'
    );
    return _row;
  end if;

  -- Path B: reopen already resolved report (max 2 reopen attempts)
  if exists (
    select 1
    from public.parking_reports pr
    where pr.id = _report_id
      and pr.reported_by = _uid
      and pr.status = 'resolved'
  ) then
    select count(*)::int
      into _reopen_count
    from public.parking_report_messages pm
    where pm.report_id = _report_id
      and pm.sender_role = 'system'
      and pm.message = 'Reporter reopened a resolved report. Incident moved back to escalation stage.';

    if _reopen_count >= 2 then
      raise exception 'Resolved report can be reopened at most 2 times';
    end if;

    update public.parking_reports
       set status = 'email_sent',
           resolved_at = null,
           email_sent_at = now(),
           email_dispatch_started_at = null,
           phone_revealed = false,
           phone_revealed_at = null
     where id = _report_id
       and reported_by = _uid
       and status = 'resolved'
    returning *
    into _row;

    if not found then
      raise exception 'Report cannot be marked unresolved';
    end if;

    insert into public.parking_report_messages (report_id, sender_role, message)
    values (
      _report_id,
      'system',
      'Reporter reopened a resolved report. Incident moved back to escalation stage.'
    );

    return _row;
  end if;

  if exists (
    select 1
    from public.parking_reports pr
    where pr.id = _report_id
      and pr.reported_by = _uid
      and pr.status = 'acknowledged'
      and (
        pr.acknowledged_at is null
        or pr.acknowledged_at > now() - interval '5 minutes'
      )
  ) then
    raise exception 'Report can be marked unresolved only 5 minutes after acknowledgement';
  end if;

  raise exception 'Report cannot be marked unresolved';
end $$;

grant execute on function public.parking_reporter_mark_unresolved(uuid) to authenticated;
