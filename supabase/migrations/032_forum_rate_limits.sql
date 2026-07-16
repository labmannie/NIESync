-- Forum posts and comments are inserted directly from the client via Supabase RLS
-- (see app/forum/page.tsx) rather than through a Next.js API route, so an
-- application-layer rate limiter (Upstash, see lib/rateLimit.ts) can't see these
-- writes at all. The existing parking report flow already solves this the same way
-- (see 002_parking_rls_rpc.sql's "Rate limit exceeded" checks against
-- parking_report_limits) — this migration applies the same pattern to the forum.

create or replace function public.forum_enforce_post_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  select count(*)::int
    into recent_count
  from public.forum_posts
  where author_id = new.author_id
    and created_at > (timezone('utc', now()) - interval '10 minutes');

  if recent_count >= 5 then
    raise exception 'Rate limit exceeded: max 5 forum posts per 10 minutes';
  end if;

  return new;
end;
$$;

create or replace function public.forum_enforce_comment_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  select count(*)::int
    into recent_count
  from public.forum_comments
  where author_id = new.author_id
    and created_at > (timezone('utc', now()) - interval '10 minutes');

  if recent_count >= 20 then
    raise exception 'Rate limit exceeded: max 20 forum comments per 10 minutes';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_forum_posts_rate_limit on public.forum_posts;
create trigger trg_forum_posts_rate_limit
before insert on public.forum_posts
for each row
execute function public.forum_enforce_post_rate_limit();

drop trigger if exists trg_forum_comments_rate_limit on public.forum_comments;
create trigger trg_forum_comments_rate_limit
before insert on public.forum_comments
for each row
execute function public.forum_enforce_comment_rate_limit();
