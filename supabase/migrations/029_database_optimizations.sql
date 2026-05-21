-- Database performance optimizations for Lost and Found and pg_net log pruning

-- 1. Optimizing Lost and Found Claims queries
create index if not exists idx_laf_claims_claimer on public.lost_and_found_claims(claimer_id);
create index if not exists idx_laf_claims_report on public.lost_and_found_claims(report_id);
create index if not exists idx_laf_claims_created on public.lost_and_found_claims(created_at desc);

-- 2. Optimizing Lost and Found Reports dashboard feed queries
create index if not exists idx_laf_reports_deleted_created on public.lost_and_found_reports(is_deleted, created_at desc);

-- 3. Initial pruning of pg_net request/response history to resolve 100% Disk IO usage
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'net' and tablename = 'http_responses') then
    delete from net.http_responses where created_at < now() - interval '1 day';
  end if;
exception
  when others then
    raise warning 'Could not run initial pg_net pruning: %', SQLERRM;
end $$;

-- 4. Setup automated daily pg_cron job to keep pg_net responses pruned
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'prune-pg-net') then
      perform cron.unschedule('prune-pg-net');
    end if;
    
    perform cron.schedule(
      'prune-pg-net',
      '0 0 * * *', -- every day at midnight
      'delete from net.http_responses where created_at < now() - interval ''1 day'';'
    );
  end if;
exception
  when others then
    raise warning 'Could not schedule pg_net pruning job: %', SQLERRM;
end $$;

-- 5. Setup RPC helper for checking background cron status
create or replace function public.check_cron_status()
returns jsonb
language plpgsql
security definer
as $$
declare
  job_count integer;
  result jsonb;
begin
  -- Check if pg_cron is active and our job is scheduled
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    select count(*) into job_count from cron.job where jobname = 'prune-pg-net';
    
    if job_count > 0 then
      result := jsonb_build_object(
        'status', 'active',
        'job_name', 'prune-pg-net',
        'schedule', '0 0 * * *'
      );
    else
      result := jsonb_build_object(
        'status', 'missing',
        'message', 'prune-pg-net cron job not found'
      );
    end if;
  else
    result := jsonb_build_object(
      'status', 'inactive',
      'message', 'pg_cron extension is not active or available'
    );
  end if;
  
  return result;
exception
  when others then
    return jsonb_build_object(
      'status', 'error',
      'message', SQLERRM
    );
end;
$$;

