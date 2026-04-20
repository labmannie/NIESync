create table if not exists public.lost_and_found_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete cascade not null,
  type text not null check (type in ('lost', 'found')),
  title text not null check (char_length(trim(title)) > 0),
  category text not null,
  location text not null check (char_length(trim(location)) > 0),
  event_time timestamptz not null,
  photo_url text,
  additional_details text,
  status text not null default 'active' check (status in ('active', 'resolved')),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_laf_reports_reporter on public.lost_and_found_reports (reporter_id);
create index if not exists idx_laf_reports_type_active on public.lost_and_found_reports (type, status) where not is_deleted;
create index if not exists idx_laf_reports_created on public.lost_and_found_reports (created_at desc);
