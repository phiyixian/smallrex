-- Storage bucket for uploaded media
INSERT INTO storage.buckets (id, name, public) VALUES ('ev-uploads', 'ev-uploads', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read ev-uploads"
ON storage.objects FOR SELECT
USING (bucket_id = 'ev-uploads');

CREATE POLICY "Anyone can upload ev-uploads"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ev-uploads');

CREATE POLICY "Anyone can update ev-uploads"
ON storage.objects FOR UPDATE
USING (bucket_id = 'ev-uploads');

CREATE POLICY "Anyone can delete ev-uploads"
ON storage.objects FOR DELETE
USING (bucket_id = 'ev-uploads');

-- Analyses table
CREATE TABLE public.analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image','video')),
  ai_provider TEXT NOT NULL,
  ai_model TEXT,
  category TEXT NOT NULL,
  observation TEXT NOT NULL,
  fault_type TEXT NOT NULL,
  action TEXT NOT NULL,
  confidence NUMERIC NOT NULL DEFAULT 0,
  annotations JSONB NOT NULL DEFAULT '[]'::jsonb,
  processing_ms INTEGER NOT NULL DEFAULT 0,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  performance JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

-- Public demo: open access (no auth in this app)
CREATE POLICY "Anyone can read analyses" ON public.analyses FOR SELECT USING (true);
CREATE POLICY "Anyone can insert analyses" ON public.analyses FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update analyses" ON public.analyses FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete analyses" ON public.analyses FOR DELETE USING (true);

CREATE INDEX idx_analyses_created_at ON public.analyses(created_at DESC);
CREATE INDEX idx_analyses_category ON public.analyses(category);
CREATE INDEX idx_analyses_provider ON public.analyses(ai_provider);