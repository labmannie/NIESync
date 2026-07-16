-- Contact form submissions.
--
-- There is no admin role/dashboard in this app yet, so the "admin-facing view" for
-- these messages is simply the Supabase Studio table editor (or any query run with
-- the service role key, which bypasses RLS). The API route also emails the inbox
-- configured via CONTACT_INBOX_EMAIL so submissions aren't silently stuck in the DB.
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  email text not null check (char_length(trim(email)) between 3 and 254),
  subject text not null check (char_length(trim(subject)) between 1 and 200),
  message text not null check (char_length(trim(message)) between 1 and 5000),
  status text not null default 'new' check (status in ('new', 'read', 'archived')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_contact_messages_created_at
  on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

-- Anyone (including logged-out visitors) can submit the contact form.
drop policy if exists contact_messages_insert_any on public.contact_messages;
create policy contact_messages_insert_any
on public.contact_messages
for insert
to anon, authenticated
with check (true);

-- No select/update/delete policy is defined on purpose: only the service role
-- (used server-side, e.g. Supabase Studio or an admin script) can read these.
grant insert on public.contact_messages to anon, authenticated;
revoke select, update, delete on public.contact_messages from anon, authenticated;
