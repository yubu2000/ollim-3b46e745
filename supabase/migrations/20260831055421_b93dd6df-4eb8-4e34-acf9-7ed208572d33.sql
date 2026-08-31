ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS keyword_suggestions jsonb;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS gsc_site_url text;

CREATE TABLE IF NOT EXISTS public.search_console_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_url text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  clicks integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  position numeric NOT NULL DEFAULT 0,
  top_queries jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_console_snapshots TO authenticated;
GRANT ALL ON public.search_console_snapshots TO service_role;
ALTER TABLE public.search_console_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own search console snapshots"
  ON public.search_console_snapshots FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);