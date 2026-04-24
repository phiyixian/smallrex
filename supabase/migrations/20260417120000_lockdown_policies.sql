-- Lock down overly permissive policies for safer public deployment

-- Storage object policies
DROP POLICY IF EXISTS "Anyone can update ev-uploads" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete ev-uploads" ON storage.objects;

-- analyses table policies
DROP POLICY IF EXISTS "Anyone can update analyses" ON public.analyses;
DROP POLICY IF EXISTS "Anyone can delete analyses" ON public.analyses;

-- Keep table append-only from public client
CREATE POLICY "Authenticated service role can update analyses"
ON public.analyses
FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated service role can delete analyses"
ON public.analyses
FOR DELETE
USING (auth.role() = 'service_role');
