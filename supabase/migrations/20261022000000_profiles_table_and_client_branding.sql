-- ============================================================================
-- Migration: Create public.profiles table, add client branding columns,
-- and initialize storage buckets for logos, brochures and property images.
-- ============================================================================

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id text PRIMARY KEY,
  email text,
  full_name text,
  phone text,
  phone_verified boolean NOT NULL DEFAULT false,
  role text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for tenant lookup
CREATE INDEX IF NOT EXISTS profiles_client_idx ON public.profiles (client_id);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Grants for Data API
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Policies on profiles
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- 2. Add missing branding and tenant columns to public.clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS waba_id text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS phone_number_id text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS access_token text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS display_phone_number text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS meta_signup_status text DEFAULT 'pending';

-- Sync company_name with name where null
UPDATE public.clients SET company_name = name WHERE company_name IS NULL;

-- 3. Ensure Storage Buckets exist
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('client-logos', 'client-logos', true),
  ('property-brochures', 'property-brochures', true),
  ('property-images', 'property-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Policies for client-logos
DROP POLICY IF EXISTS "Public Access for client-logos" ON storage.objects;
CREATE POLICY "Public Access for client-logos" ON storage.objects
  FOR ALL TO anon, authenticated, service_role
  USING (bucket_id = 'client-logos')
  WITH CHECK (bucket_id = 'client-logos');

-- Storage Policies for property-brochures
DROP POLICY IF EXISTS "Public Access for property-brochures" ON storage.objects;
CREATE POLICY "Public Access for property-brochures" ON storage.objects
  FOR ALL TO anon, authenticated, service_role
  USING (bucket_id = 'property-brochures')
  WITH CHECK (bucket_id = 'property-brochures');

-- Storage Policies for property-images
DROP POLICY IF EXISTS "Public Access for property-images" ON storage.objects;
CREATE POLICY "Public Access for property-images" ON storage.objects
  FOR ALL TO anon, authenticated, service_role
  USING (bucket_id = 'property-images')
  WITH CHECK (bucket_id = 'property-images');
