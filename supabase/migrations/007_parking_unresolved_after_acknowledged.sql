alter table public.parking_reports
  add column if not exists acknowledged_at timestamptz;

update public.parking_reports
   set acknowledged_at = coalesce(acknowledged_at, email_sent_at, created_at, now())
 where status = 'acknowledged'
   and acknowledged_at is null;

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
     set status = 'acknowledged',
         acknowledged_at = now()
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

create or replace function public.parking_reporter_mark_unresolved(_report_id uuid)
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
     set status = 'email_sent',
         email_sent_at = coalesce(email_sent_at, now()),
         resolved_at = null
   where id = _report_id
     and reported_by = _uid
     and status = 'acknowledged'
     and acknowledged_at is not null
     and acknowledged_at <= now() - interval '5 minutes'
  returning *
  into _row;

  if not found then
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
  end if;

  insert into public.parking_report_messages (report_id, sender_role, message)
  values (
    _report_id,
    'system',
    'Reporter marked unresolved after acknowledgement. Escalation has been reopened.'
  );

  return _row;
end $$;

grant execute on function public.parking_owner_im_moving(uuid) to authenticated;
grant execute on function public.parking_reporter_mark_unresolved(uuid) to authenticated;
