drop function if exists public.forum_public_profiles(uuid[]);

create or replace function public.forum_public_profiles(_ids uuid[])
returns table (
  id uuid,
  first_name text,
  last_name text,
  username text,
  avatar_url text,
  email_verified boolean
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.first_name,
    p.last_name,
    p.username,
    p.avatar_url,
    coalesce(p.email_verified, false) as email_verified
  from public.profiles p
  where p.id = any(coalesce(_ids, '{}'::uuid[]));
$$;

grant execute on function public.forum_public_profiles(uuid[]) to authenticated;
