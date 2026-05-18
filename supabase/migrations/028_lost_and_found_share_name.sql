alter table public.lost_and_found_reports
add column if not exists share_name boolean not null default true;
