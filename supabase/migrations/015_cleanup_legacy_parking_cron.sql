create extension if not exists pg_cron;

do $$
begin
  -- Legacy Edge Function scheduler from early rollout; keep only Next.js cron route.
  if exists (select 1 from cron.job where jobname = 'parking-escalate-email') then
    perform cron.unschedule('parking-escalate-email');
  end if;
end $$;
