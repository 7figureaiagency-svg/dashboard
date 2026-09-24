ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS selected_property_brochure_url text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS selected_property_map_url text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO anon, authenticated;
GRANT ALL ON public.leads TO service_role;
GRANT ALL ON public.inventory TO service_role;

DROP POLICY IF EXISTS "Public can manage brochures" ON storage.objects;
CREATE POLICY "Public can manage brochures" ON storage.objects FOR ALL USING (bucket_id = 'property-brochures') WITH CHECK (bucket_id = 'property-brochures');