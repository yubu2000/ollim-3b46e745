CREATE TABLE public.generated_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  audit_id UUID REFERENCES public.audits(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  target_keyword TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '가이드',
  outline JSONB NOT NULL DEFAULT '[]'::jsonb,
  markdown TEXT NOT NULL DEFAULT '',
  meta_title TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  faq JSONB NOT NULL DEFAULT '[]'::jsonb,
  jsonld JSONB,
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_articles TO authenticated;
GRANT ALL ON public.generated_articles TO service_role;

ALTER TABLE public.generated_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own generated articles"
ON public.generated_articles FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX generated_articles_project_idx ON public.generated_articles (project_id, created_at DESC);