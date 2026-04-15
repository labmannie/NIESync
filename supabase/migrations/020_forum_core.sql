create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  tag text not null default 'help',
  relation_type text,
  location_label text,
  is_anonymous boolean not null default false,
  comments_count integer not null default 0,
  upvotes_count integer not null default 0,
  downvotes_count integer not null default 0,
  likes_count integer not null default 0,
  score integer not null default 0,
  image_count integer not null default 0,
  search_document tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || coalesce(location_label, '')
    )
  ) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (char_length(trim(title)) between 4 and 140),
  check (char_length(trim(body)) between 10 and 5000),
  check (tag in ('lost', 'help', 'rant', 'events', 'general')),
  check (relation_type is null or relation_type in ('lost_found', 'event')),
  check (location_label is null or char_length(trim(location_label)) between 2 and 120)
);

create table if not exists public.forum_post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  storage_path text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  check (char_length(trim(storage_path)) > 0),
  check (display_order >= 0)
);

create table if not exists public.forum_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.forum_comments(id) on delete cascade,
  body text not null,
  replies_count integer not null default 0,
  upvotes_count integer not null default 0,
  downvotes_count integer not null default 0,
  score integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (char_length(trim(body)) between 1 and 2000)
);

create table if not exists public.forum_post_reactions (
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction smallint not null check (reaction in (-1, 1)),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (post_id, user_id)
);

create table if not exists public.forum_comment_reactions (
  comment_id uuid not null references public.forum_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction smallint not null check (reaction in (-1, 1)),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (comment_id, user_id)
);

create table if not exists public.forum_post_likes (
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (post_id, user_id)
);

create index if not exists idx_forum_posts_created_at
  on public.forum_posts (created_at desc);

create index if not exists idx_forum_posts_tag_created_at
  on public.forum_posts (tag, created_at desc);

create index if not exists idx_forum_posts_relation_created_at
  on public.forum_posts (relation_type, created_at desc);

create index if not exists idx_forum_posts_score_created_at
  on public.forum_posts (score desc, created_at desc);

create index if not exists idx_forum_posts_search_document
  on public.forum_posts using gin (search_document);

create index if not exists idx_forum_post_images_post_order
  on public.forum_post_images (post_id, display_order, created_at);

create index if not exists idx_forum_comments_post_created_at
  on public.forum_comments (post_id, created_at asc);

create index if not exists idx_forum_comments_parent_created_at
  on public.forum_comments (parent_comment_id, created_at asc);

create index if not exists idx_forum_comments_author_created_at
  on public.forum_comments (author_id, created_at desc);

create index if not exists idx_forum_post_reactions_user_updated_at
  on public.forum_post_reactions (user_id, updated_at desc);

create index if not exists idx_forum_comment_reactions_user_updated_at
  on public.forum_comment_reactions (user_id, updated_at desc);

create index if not exists idx_forum_post_likes_user_created_at
  on public.forum_post_likes (user_id, created_at desc);

create or replace function public.forum_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create or replace function public.forum_validate_comment_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_row public.forum_comments;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select *
    into parent_row
  from public.forum_comments
  where id = new.parent_comment_id;

  if not found then
    raise exception 'Parent comment does not exist.';
  end if;

  if parent_row.post_id <> new.post_id then
    raise exception 'Reply must belong to the same post.';
  end if;

  if parent_row.parent_comment_id is not null then
    raise exception 'Only one level of replies is supported.';
  end if;

  return new;
end;
$$;

create or replace function public.forum_enforce_post_image_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  image_total integer;
begin
  select count(*)::int
    into image_total
  from public.forum_post_images
  where post_id = new.post_id;

  if image_total >= 6 then
    raise exception 'Maximum 6 images per post.';
  end if;

  return new;
end;
$$;

create or replace function public.forum_sync_post_comment_counts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.forum_posts
       set comments_count = comments_count + 1,
           updated_at = timezone('utc', now())
     where id = new.post_id;

    if new.parent_comment_id is not null then
      update public.forum_comments
         set replies_count = replies_count + 1,
             updated_at = timezone('utc', now())
       where id = new.parent_comment_id;
    end if;
  elsif tg_op = 'DELETE' then
    update public.forum_posts
       set comments_count = greatest(comments_count - 1, 0),
           updated_at = timezone('utc', now())
     where id = old.post_id;

    if old.parent_comment_id is not null then
      update public.forum_comments
         set replies_count = greatest(replies_count - 1, 0),
             updated_at = timezone('utc', now())
       where id = old.parent_comment_id;
    end if;
  end if;

  return null;
end;
$$;

create or replace function public.forum_sync_post_reaction_counts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_post_id uuid;
begin
  target_post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;

  update public.forum_posts p
     set upvotes_count = coalesce(s.upvotes, 0),
         downvotes_count = coalesce(s.downvotes, 0),
         score = coalesce(s.upvotes, 0) - coalesce(s.downvotes, 0),
         updated_at = timezone('utc', now())
    from (
      select
        post_id,
        count(*) filter (where reaction = 1)::int as upvotes,
        count(*) filter (where reaction = -1)::int as downvotes
      from public.forum_post_reactions
      where post_id = target_post_id
      group by post_id
    ) s
   where p.id = target_post_id
     and p.id = s.post_id;

  if not exists (
    select 1
    from public.forum_post_reactions
    where post_id = target_post_id
  ) then
    update public.forum_posts
       set upvotes_count = 0,
           downvotes_count = 0,
           score = 0,
           updated_at = timezone('utc', now())
     where id = target_post_id;
  end if;

  return null;
end;
$$;

create or replace function public.forum_sync_comment_reaction_counts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_comment_id uuid;
begin
  target_comment_id := case when tg_op = 'DELETE' then old.comment_id else new.comment_id end;

  update public.forum_comments c
     set upvotes_count = coalesce(s.upvotes, 0),
         downvotes_count = coalesce(s.downvotes, 0),
         score = coalesce(s.upvotes, 0) - coalesce(s.downvotes, 0),
         updated_at = timezone('utc', now())
    from (
      select
        comment_id,
        count(*) filter (where reaction = 1)::int as upvotes,
        count(*) filter (where reaction = -1)::int as downvotes
      from public.forum_comment_reactions
      where comment_id = target_comment_id
      group by comment_id
    ) s
   where c.id = target_comment_id
     and c.id = s.comment_id;

  if not exists (
    select 1
    from public.forum_comment_reactions
    where comment_id = target_comment_id
  ) then
    update public.forum_comments
       set upvotes_count = 0,
           downvotes_count = 0,
           score = 0,
           updated_at = timezone('utc', now())
     where id = target_comment_id;
  end if;

  return null;
end;
$$;

create or replace function public.forum_sync_post_like_counts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_post_id uuid;
begin
  target_post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;

  update public.forum_posts
     set likes_count = (
       select count(*)::int
       from public.forum_post_likes
       where post_id = target_post_id
     ),
         updated_at = timezone('utc', now())
   where id = target_post_id;

  return null;
end;
$$;

create or replace function public.forum_sync_post_image_counts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_post_id uuid;
begin
  target_post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;

  update public.forum_posts
     set image_count = (
       select count(*)::int
       from public.forum_post_images
       where post_id = target_post_id
     ),
         updated_at = timezone('utc', now())
   where id = target_post_id;

  return null;
end;
$$;

drop trigger if exists trg_forum_posts_set_updated_at on public.forum_posts;
create trigger trg_forum_posts_set_updated_at
before update on public.forum_posts
for each row
execute function public.forum_set_updated_at();

drop trigger if exists trg_forum_comments_set_updated_at on public.forum_comments;
create trigger trg_forum_comments_set_updated_at
before update on public.forum_comments
for each row
execute function public.forum_set_updated_at();

drop trigger if exists trg_forum_post_reactions_set_updated_at on public.forum_post_reactions;
create trigger trg_forum_post_reactions_set_updated_at
before update on public.forum_post_reactions
for each row
execute function public.forum_set_updated_at();

drop trigger if exists trg_forum_comment_reactions_set_updated_at on public.forum_comment_reactions;
create trigger trg_forum_comment_reactions_set_updated_at
before update on public.forum_comment_reactions
for each row
execute function public.forum_set_updated_at();

drop trigger if exists trg_forum_comments_validate_parent on public.forum_comments;
create trigger trg_forum_comments_validate_parent
before insert or update of parent_comment_id, post_id
on public.forum_comments
for each row
execute function public.forum_validate_comment_parent();

drop trigger if exists trg_forum_post_images_enforce_limit on public.forum_post_images;
create trigger trg_forum_post_images_enforce_limit
before insert on public.forum_post_images
for each row
execute function public.forum_enforce_post_image_limit();

drop trigger if exists trg_forum_comments_sync_post_counts on public.forum_comments;
create trigger trg_forum_comments_sync_post_counts
after insert or delete
on public.forum_comments
for each row
execute function public.forum_sync_post_comment_counts();

drop trigger if exists trg_forum_post_reactions_sync_counts on public.forum_post_reactions;
create trigger trg_forum_post_reactions_sync_counts
after insert or update or delete
on public.forum_post_reactions
for each row
execute function public.forum_sync_post_reaction_counts();

drop trigger if exists trg_forum_comment_reactions_sync_counts on public.forum_comment_reactions;
create trigger trg_forum_comment_reactions_sync_counts
after insert or update or delete
on public.forum_comment_reactions
for each row
execute function public.forum_sync_comment_reaction_counts();

drop trigger if exists trg_forum_post_likes_sync_counts on public.forum_post_likes;
create trigger trg_forum_post_likes_sync_counts
after insert or delete
on public.forum_post_likes
for each row
execute function public.forum_sync_post_like_counts();

drop trigger if exists trg_forum_post_images_sync_counts on public.forum_post_images;
create trigger trg_forum_post_images_sync_counts
after insert or delete
on public.forum_post_images
for each row
execute function public.forum_sync_post_image_counts();

alter table public.forum_posts enable row level security;
alter table public.forum_post_images enable row level security;
alter table public.forum_comments enable row level security;
alter table public.forum_post_reactions enable row level security;
alter table public.forum_comment_reactions enable row level security;
alter table public.forum_post_likes enable row level security;

drop policy if exists forum_posts_select_all on public.forum_posts;
create policy forum_posts_select_all
on public.forum_posts
for select
to authenticated
using (true);

drop policy if exists forum_posts_insert_own on public.forum_posts;
create policy forum_posts_insert_own
on public.forum_posts
for insert
to authenticated
with check (author_id = auth.uid());

drop policy if exists forum_posts_update_own on public.forum_posts;
create policy forum_posts_update_own
on public.forum_posts
for update
to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

drop policy if exists forum_posts_delete_own on public.forum_posts;
create policy forum_posts_delete_own
on public.forum_posts
for delete
to authenticated
using (author_id = auth.uid());

drop policy if exists forum_post_images_select_all on public.forum_post_images;
create policy forum_post_images_select_all
on public.forum_post_images
for select
to authenticated
using (true);

drop policy if exists forum_post_images_insert_owner on public.forum_post_images;
create policy forum_post_images_insert_owner
on public.forum_post_images
for insert
to authenticated
with check (
  exists (
    select 1
    from public.forum_posts fp
    where fp.id = forum_post_images.post_id
      and fp.author_id = auth.uid()
  )
);

drop policy if exists forum_post_images_update_owner on public.forum_post_images;
create policy forum_post_images_update_owner
on public.forum_post_images
for update
to authenticated
using (
  exists (
    select 1
    from public.forum_posts fp
    where fp.id = forum_post_images.post_id
      and fp.author_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.forum_posts fp
    where fp.id = forum_post_images.post_id
      and fp.author_id = auth.uid()
  )
);

drop policy if exists forum_post_images_delete_owner on public.forum_post_images;
create policy forum_post_images_delete_owner
on public.forum_post_images
for delete
to authenticated
using (
  exists (
    select 1
    from public.forum_posts fp
    where fp.id = forum_post_images.post_id
      and fp.author_id = auth.uid()
  )
);

drop policy if exists forum_comments_select_all on public.forum_comments;
create policy forum_comments_select_all
on public.forum_comments
for select
to authenticated
using (true);

drop policy if exists forum_comments_insert_own on public.forum_comments;
create policy forum_comments_insert_own
on public.forum_comments
for insert
to authenticated
with check (author_id = auth.uid());

drop policy if exists forum_comments_update_own on public.forum_comments;
create policy forum_comments_update_own
on public.forum_comments
for update
to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

drop policy if exists forum_comments_delete_own on public.forum_comments;
create policy forum_comments_delete_own
on public.forum_comments
for delete
to authenticated
using (author_id = auth.uid());

drop policy if exists forum_post_reactions_select_all on public.forum_post_reactions;
create policy forum_post_reactions_select_all
on public.forum_post_reactions
for select
to authenticated
using (true);

drop policy if exists forum_post_reactions_insert_own on public.forum_post_reactions;
create policy forum_post_reactions_insert_own
on public.forum_post_reactions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists forum_post_reactions_update_own on public.forum_post_reactions;
create policy forum_post_reactions_update_own
on public.forum_post_reactions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists forum_post_reactions_delete_own on public.forum_post_reactions;
create policy forum_post_reactions_delete_own
on public.forum_post_reactions
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists forum_comment_reactions_select_all on public.forum_comment_reactions;
create policy forum_comment_reactions_select_all
on public.forum_comment_reactions
for select
to authenticated
using (true);

drop policy if exists forum_comment_reactions_insert_own on public.forum_comment_reactions;
create policy forum_comment_reactions_insert_own
on public.forum_comment_reactions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists forum_comment_reactions_update_own on public.forum_comment_reactions;
create policy forum_comment_reactions_update_own
on public.forum_comment_reactions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists forum_comment_reactions_delete_own on public.forum_comment_reactions;
create policy forum_comment_reactions_delete_own
on public.forum_comment_reactions
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists forum_post_likes_select_all on public.forum_post_likes;
create policy forum_post_likes_select_all
on public.forum_post_likes
for select
to authenticated
using (true);

drop policy if exists forum_post_likes_insert_own on public.forum_post_likes;
create policy forum_post_likes_insert_own
on public.forum_post_likes
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists forum_post_likes_delete_own on public.forum_post_likes;
create policy forum_post_likes_delete_own
on public.forum_post_likes
for delete
to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on public.forum_posts to authenticated;
grant select, insert, update, delete on public.forum_post_images to authenticated;
grant select, insert, update, delete on public.forum_comments to authenticated;
grant select, insert, update, delete on public.forum_post_reactions to authenticated;
grant select, insert, update, delete on public.forum_comment_reactions to authenticated;
grant select, insert, delete on public.forum_post_likes to authenticated;

revoke all on public.forum_posts from anon;
revoke all on public.forum_post_images from anon;
revoke all on public.forum_comments from anon;
revoke all on public.forum_post_reactions from anon;
revoke all on public.forum_comment_reactions from anon;
revoke all on public.forum_post_likes from anon;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'forum-images',
  'forum-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists forum_images_read_public on storage.objects;
create policy forum_images_read_public
on storage.objects
for select
to public
using (bucket_id = 'forum-images');

drop policy if exists forum_images_insert_owner on storage.objects;
create policy forum_images_insert_owner
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'forum-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists forum_images_update_owner on storage.objects;
create policy forum_images_update_owner
on storage.objects
for update
to authenticated
using (
  bucket_id = 'forum-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'forum-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists forum_images_delete_owner on storage.objects;
create policy forum_images_delete_owner
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'forum-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.forum_posts;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.forum_post_images;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.forum_comments;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.forum_post_reactions;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.forum_comment_reactions;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.forum_post_likes;
  exception
    when duplicate_object then null;
  end;
end $$;
