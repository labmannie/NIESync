create table if not exists public.lost_and_found_claims (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.lost_and_found_reports(id) on delete cascade not null,
  claimer_id uuid references public.profiles(id) on delete cascade not null,
  message text,
  phone_number text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(report_id, claimer_id)
);

alter table public.lost_and_found_claims enable row level security;

drop policy if exists laf_claims_select_own on public.lost_and_found_claims;
create policy laf_claims_select_own on public.lost_and_found_claims
for select to authenticated
using (claimer_id = auth.uid() or exists (select 1 from public.lost_and_found_reports r where r.id = report_id and r.reporter_id = auth.uid()));

drop policy if exists laf_claims_insert_own on public.lost_and_found_claims;
create policy laf_claims_insert_own on public.lost_and_found_claims
for insert to authenticated
with check (claimer_id = auth.uid());

drop policy if exists laf_claims_update_own on public.lost_and_found_claims;
create policy laf_claims_update_own on public.lost_and_found_claims
for update to authenticated
using (claimer_id = auth.uid() or exists (select 1 from public.lost_and_found_reports r where r.id = report_id and r.reporter_id = auth.uid()));

-- enable realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.lost_and_found_claims;
  exception
    when duplicate_object then null;
  end;
end $$;
