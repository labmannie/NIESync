alter table public.parking_reports
  add column if not exists email_dispatch_started_at timestamptz;

alter table public.parking_reports
  add column if not exists phone_revealed_at timestamptz;

update public.parking_reports
   set phone_revealed_at = coalesce(phone_revealed_at, email_sent_at, created_at, now())
 where phone_revealed = true
   and phone_revealed_at is null;

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
        or (
          pr.email_sent_at is not null
          and pr.email_sent_at <= now() - interval '1 minute'
        )
      )
  );
$$;

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

  if _report.email_sent_at is null then
    raise exception 'Phone reveal not yet allowed';
  end if;

  if (not _report.phone_revealed) and _report.email_sent_at > now() - interval '1 minute' then
    raise exception 'Phone reveal not yet allowed';
  end if;

  if not _report.phone_revealed then
    update public.parking_reports
       set phone_revealed = true,
           phone_revealed_at = coalesce(phone_revealed_at, now())
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
grant execute on function public.parking_reveal_phone(uuid) to authenticated;
