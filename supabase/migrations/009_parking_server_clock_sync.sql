create or replace function public.parking_server_now()
returns table (server_now timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select now() as server_now;
$$;

grant execute on function public.parking_server_now() to authenticated;
