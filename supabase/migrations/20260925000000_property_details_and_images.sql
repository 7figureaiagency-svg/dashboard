-- ============================================================================
-- Universal property-detail fields + a real photo gallery for inventory.
--
-- Adds the fields real-estate listings are expected to carry regardless of
-- category (RERA number, carpet/built-up/super-built-up area, property age,
-- transaction type, facing, ownership type, negotiability, maintenance,
-- amenities) plus multi-image support via a dedicated storage bucket, scoped
-- per tenant the same way `property-brochures` already is.
-- ============================================================================

ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS rera_number text;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS carpet_area_sqft numeric;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS super_built_up_area_sqft numeric;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS property_age_years integer;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS transaction_type text;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS facing text;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS ownership_type text;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS price_negotiable boolean NOT NULL DEFAULT false;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS maintenance_charges numeric;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS amenities text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';

-- `area_sqft` (the original column) is treated as "Built-up area" going
-- forward — no rename needed, just a UI relabel — so it sits alongside the
-- two new area figures rather than duplicating one of them.

INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images', 'property-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view property images" ON storage.objects;
CREATE POLICY "Public can view property images"
ON storage.objects FOR SELECT
USING (bucket_id = 'property-images');

DROP POLICY IF EXISTS "Tenants upload own property images" ON storage.objects;
CREATE POLICY "Tenants upload own property images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'property-images'
  AND (storage.foldername(name))[1] = public.current_client_id()::text
);

DROP POLICY IF EXISTS "Tenants update own property images" ON storage.objects;
CREATE POLICY "Tenants update own property images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'property-images'
  AND (storage.foldername(name))[1] = public.current_client_id()::text
);

DROP POLICY IF EXISTS "Tenants delete own property images" ON storage.objects;
CREATE POLICY "Tenants delete own property images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'property-images'
  AND (storage.foldername(name))[1] = public.current_client_id()::text
);
