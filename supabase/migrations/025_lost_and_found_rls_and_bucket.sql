alter table public.lost_and_found_reports enable row level security;

drop policy if exists laf_reports_select_public on public.lost_and_found_reports;
create policy laf_reports_select_public
on public.lost_and_found_reports
for select
to authenticated
using (not is_deleted or reporter_id = auth.uid());

drop policy if exists laf_reports_insert_own on public.lost_and_found_reports;
create policy laf_reports_insert_own
on public.lost_and_found_reports
for insert
to authenticated
with check (reporter_id = auth.uid());

drop policy if exists laf_reports_update_own on public.lost_and_found_reports;
create policy laf_reports_update_own
on public.lost_and_found_reports
for update
to authenticated
using (reporter_id = auth.uid());

drop policy if exists laf_reports_delete_own on public.lost_and_found_reports;
create policy laf_reports_delete_own
on public.lost_and_found_reports
for delete
to authenticated
using (reporter_id = auth.uid());

-- Bucket Creation
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'lost-and-found',
  'lost-and-found',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Delete old duplicate policies if they exist (clean up before recreation)
drop policy if exists "Give users authenticated access to lost-and-found folder 1mrg" on storage.objects;
drop policy if exists "Give users authenticated inserts to lost-and-found folder 1mrg" on storage.objects;
drop policy if exists "Give users authenticated update to lost-and-found folder 1mrg" on storage.objects;
drop policy if exists "Give users authenticated delete to lost-and-found folder 1mrg" on storage.objects;

create policy "Give users authenticated access to lost-and-found folder 1mrg" on storage.objects for select to authenticated using ( bucket_id = 'lost-and-found' );
create policy "Give users authenticated inserts to lost-and-found folder 1mrg" on storage.objects for insert to authenticated with check ( bucket_id = 'lost-and-found' );
create policy "Give users authenticated update to lost-and-found folder 1mrg" on storage.objects for update to authenticated using ( bucket_id = 'lost-and-found' and auth.uid() = owner );
create policy "Give users authenticated delete to lost-and-found folder 1mrg" on storage.objects for delete to authenticated using ( bucket_id = 'lost-and-found' and auth.uid() = owner );

-- Add table to realtime publication
do $$
begin
  begin
    alter publication supabase_realtime add table public.lost_and_found_reports;
  exception
    when duplicate_object then null;
  end;
end $$;
