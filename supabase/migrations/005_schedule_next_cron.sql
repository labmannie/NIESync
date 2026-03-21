create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace placeholders before running.
do $$
declare
  _app_url text := 'https://YOUR_APP_DOMAIN';
  _cron_secret text := 'REPLACE_WITH_CRON_SECRET';
  _job_sql text;
begin
  if _app_url like '%YOUR_APP_DOMAIN%' then
    raise exception 'Set _app_url in 005_schedule_next_cron.sql before running.';
  end if;

  if _app_url like 'http://localhost%' or _app_url like 'http://127.0.0.1%' then
    raise exception 'Supabase cron cannot call localhost URLs. Use your deployed public app URL.';
  end if;

  if _cron_secret = 'REPLACE_WITH_CRON_SECRET' then
    raise exception 'Set _cron_secret in 005_schedule_next_cron.sql before running.';
  end if;

  _job_sql := format(
    'select net.http_get(url := %L);',
    _app_url || '/api/cron/parking-escalate?secret=' || _cron_secret
  );

  if exists (select 1 from cron.job where jobname = 'parking-escalate-next-api') then
    perform cron.unschedule('parking-escalate-next-api');
  end if;

  perform cron.schedule(
    'parking-escalate-next-api',
    '* * * * *',
    _job_sql
  );
end $$;
