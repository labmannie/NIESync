create extension if not exists pg_cron;
create extension if not exists pg_net;

-- This version intentionally avoids the `vault` extension.
-- Replace the placeholders below before running this migration.
do $$
declare
  _project_url text := 'https://mhaajysljuaosdseboid.supabase.co';
  _cron_secret text := 'niesync123';
  _job_sql text;
begin
  if _project_url like '%YOUR_PROJECT_REF%' then
    raise exception 'Set _project_url in 003_parking_cron.sql before running.';
  end if;

  if _cron_secret = 'REPLACE_WITH_STRONG_CRON_SECRET' then
    raise exception 'Set _cron_secret in 003_parking_cron.sql before running.';
  end if;

  _job_sql := format(
    'select net.http_post(
       url := %L,
       headers := %L::jsonb,
       body := %L::jsonb
     );',
    _project_url || '/functions/v1/parking-escalate-email',
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', _cron_secret
    )::text,
    jsonb_build_object(
      'source', 'pg_cron'
    )::text
  );

  if exists (select 1 from cron.job where jobname = 'parking-escalate-email') then
    perform cron.unschedule('parking-escalate-email');
  end if;

  perform cron.schedule(
    'parking-escalate-email',
    '* * * * *',
    _job_sql
  );
end $$;
