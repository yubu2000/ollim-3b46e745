CREATE TABLE public.wordpress_sites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  site_url TEXT NOT NULL,
  username TEXT NOT NULL,
  app_password TEXT NOT NULL,
  default_status TEXT NOT NULL DEFAULT 'draft',
  last_checked_at TIMESTAMPTZ,
  last_check_ok BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wordpress_sites TO authenticated;
GRANT ALL ON public.wordpress_sites TO service_role;
ALTER TABLE public.wordpress_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own WordPress site" ON public.wordpress_sites FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.publish_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  audit_id UUID REFERENCES public.audits ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects ON DELETE CASCADE,
  url TEXT NOT NULL,
  final_url TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 0,
  reachable BOOLEAN NOT NULL DEFAULT false,
  has_canonical BOOLEAN NOT NULL DEFAULT false,
  has_jsonld BOOLEAN NOT NULL DEFAULT false,
  canonical TEXT NOT NULL DEFAULT '',
  jsonld_types TEXT[] NOT NULL DEFAULT '{}',
  passed_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_verifications TO authenticated;
GRANT ALL ON public.publish_verifications TO service_role;
ALTER TABLE public.publish_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own publish verifications" ON public.publish_verifications FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_publish_verifications_audit ON public.publish_verifications (audit_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_wordpress_sites_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER update_wordpress_sites_updated_at BEFORE UPDATE ON public.wordpress_sites FOR EACH ROW EXECUTE FUNCTION public.touch_wordpress_sites_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.search_console_snapshots;