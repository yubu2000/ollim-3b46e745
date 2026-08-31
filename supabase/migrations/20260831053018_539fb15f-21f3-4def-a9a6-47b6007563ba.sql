ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS auto_audit_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_audit_interval_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS last_auto_audit_at timestamp with time zone;

ALTER TABLE public.competitor_audits
  ADD COLUMN IF NOT EXISTS metrics jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT vault.create_secret('cd5cc11922a2550a723ef60391c48b2bba4c9a54486df9ba', 'auto_audit_cron_secret', 'GEO Radar auto audit cron token');

SELECT cron.unschedule('geo-radar-auto-audit') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'geo-radar-auto-audit');

SELECT cron.schedule(
  'geo-radar-auto-audit',
  '17 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--ade3a891-1c09-427e-8e26-136492f0d13e-dev.lovable.app/api/public/cron/auto-audit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'auto_audit_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);