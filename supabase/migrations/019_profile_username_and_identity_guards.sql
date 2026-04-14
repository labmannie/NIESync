create table if not exists public.profile_username_changes (
  id bigserial primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  old_username text,
  new_username text not null,
  changed_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_profile_username_changes_profile_changed_at
  on public.profile_username_changes (profile_id, changed_at desc);

revoke all on public.profile_username_changes from anon;
revoke all on public.profile_username_changes from authenticated;

grant select on public.profile_username_changes to service_role;

create or replace function public.enforce_profile_identity_and_username_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_user_type text := nullif(trim(coalesce(old.user_type, '')), '');
  incoming_user_type text := nullif(trim(coalesce(new.user_type, '')), '');
  previous_usn text := nullif(trim(coalesce(old.usn, '')), '');
  incoming_usn text := nullif(trim(coalesce(new.usn, '')), '');
  previous_username text := lower(trim(coalesce(old.username, '')));
  incoming_username text := lower(trim(coalesce(new.username, '')));
  last_change_at timestamptz;
  changes_last_year int;
begin
  if previous_user_type is not null and previous_user_type is distinct from incoming_user_type then
    raise exception 'User type cannot be changed after initial setup.';
  end if;

  if previous_usn is not null and previous_usn is distinct from incoming_usn then
    raise exception 'USN cannot be changed after initial setup.';
  end if;

  if previous_username is distinct from incoming_username then
    if incoming_username = '' then
      raise exception 'Username cannot be empty.';
    end if;

    select max(changed_at)
      into last_change_at
    from public.profile_username_changes
    where profile_id = old.id;

    if last_change_at is not null and last_change_at > (now() - interval '30 days') then
      raise exception 'Username can be changed only once every 30 days.';
    end if;

    select count(*)::int
      into changes_last_year
    from public.profile_username_changes
    where profile_id = old.id
      and changed_at > (now() - interval '365 days');

    if changes_last_year >= 3 then
      raise exception 'Username can be changed at most 3 times in 365 days.';
    end if;

    insert into public.profile_username_changes (
      profile_id,
      old_username,
      new_username,
      changed_at
    )
    values (
      old.id,
      nullif(previous_username, ''),
      incoming_username,
      timezone('utc', now())
    );
  end if;

  if incoming_username <> '' then
    new.username := incoming_username;
  end if;

  return new;
end;
$$;

grant execute on function public.enforce_profile_identity_and_username_policy() to authenticated;

drop trigger if exists trg_profiles_enforce_identity_username on public.profiles;
create trigger trg_profiles_enforce_identity_username
before update of username, user_type, usn on public.profiles
for each row
execute function public.enforce_profile_identity_and_username_policy();
