create or replace function public.parking_reporter_cancel(_report_id uuid)
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
     set status = 'expired',
         email_dispatch_started_at = null
   where id = _report_id
     and reported_by = _uid
     and status in ('pending', 'chatting')
     and created_at > now() - interval '1 minute'
  returning *
  into _row;

  if found then
    insert into public.parking_report_messages (report_id, sender_role, message)
    values (_report_id, 'system', 'Reporter cancelled this parking report during Stage 1.');

    return _row;
  end if;

  if exists (
    select 1
    from public.parking_reports pr
    where pr.id = _report_id
      and pr.reported_by = _uid
      and pr.status in ('pending', 'chatting')
      and pr.created_at <= now() - interval '1 minute'
  ) then
    raise exception 'Report can be cancelled only during first minute';
  end if;

  raise exception 'Report cannot be cancelled';
end $$;

grant execute on function public.parking_reporter_cancel(uuid) to authenticated;
