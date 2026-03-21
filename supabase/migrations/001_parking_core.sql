create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.parking_reports (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid references public.profiles(id) on delete set null,
  license_plate text not null,
  plate_normalized text generated always as (
    upper(regexp_replace(license_plate, '[^A-Za-z0-9]', '', 'g'))
  ) stored,
  ocr_raw_text text,
  photo_url text,
  location_description text not null,
  matched_owner_id uuid references public.profiles(id) on delete set null,
  matched_vehicle_id uuid references public.profile_vehicles(id) on delete set null,
  status text not null default 'pending',
  phone_revealed boolean not null default false,
  email_sent_at timestamptz,
  resolved_at timestamptz,
  resolve_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  check (
    status in (
      'pending',
      'chatting',
      'acknowledged',
      'email_sent',
      'resolved',
      'unmatched',
      'expired'
    )
  ),
  check (char_length(trim(location_description)) > 0),
  check (char_length(plate_normalized) between 6 and 14),
  check ((status = 'resolved' and resolved_at is not null) or (status <> 'resolved'))
);

create table if not exists public.parking_report_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.parking_reports(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_role text not null check (sender_role in ('reporter', 'owner', 'system')),
  message text not null check (char_length(trim(message)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.parking_report_limits (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  report_id uuid not null references public.parking_reports(id) on delete cascade,
  reported_at timestamptz not null default now()
);

create index if not exists idx_parking_reports_reported_by_created
  on public.parking_reports (reported_by, created_at desc);
create index if not exists idx_parking_reports_plate_created
  on public.parking_reports (plate_normalized, created_at desc);
create index if not exists idx_parking_reports_owner_status
  on public.parking_reports (matched_owner_id, status, created_at desc);
create index if not exists idx_parking_reports_status_created
  on public.parking_reports (status, created_at asc);
create index if not exists idx_parking_reports_resolve_token
  on public.parking_reports (id, resolve_token);

create index if not exists idx_parking_messages_report_created
  on public.parking_report_messages (report_id, created_at asc);

create index if not exists idx_parking_limits_reporter_time
  on public.parking_report_limits (reporter_id, reported_at desc);

create unique index if not exists ux_parking_one_open_report_per_reporter
  on public.parking_reports (reported_by)
  where reported_by is not null
    and status in ('pending', 'chatting', 'acknowledged', 'email_sent');
