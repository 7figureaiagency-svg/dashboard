-- Migration: Strict Multi-Tenant Data Isolation and Griham Realty Inventory
-- Date: 2026-10-24

-- 1. Helper function to look up current client_id from profiles
CREATE OR REPLACE FUNCTION public.current_client_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM public.profiles WHERE id = auth.uid()::text LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_client_id() TO authenticated, anon;

-- 2. Hardened RLS Policies for leads
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_select_leads" ON public.leads;
DROP POLICY IF EXISTS "dashboard_insert_leads" ON public.leads;
DROP POLICY IF EXISTS "dashboard_update_leads" ON public.leads;
DROP POLICY IF EXISTS "dashboard_delete_leads" ON public.leads;
DROP POLICY IF EXISTS "leads_tenant_select" ON public.leads;
DROP POLICY IF EXISTS "leads_tenant_insert" ON public.leads;
DROP POLICY IF EXISTS "leads_tenant_update" ON public.leads;
DROP POLICY IF EXISTS "leads_tenant_delete" ON public.leads;

CREATE POLICY "leads_tenant_select" ON public.leads
  FOR SELECT TO authenticated
  USING (client_id = public.current_client_id());

CREATE POLICY "leads_tenant_insert" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (client_id = public.current_client_id());

CREATE POLICY "leads_tenant_update" ON public.leads
  FOR UPDATE TO authenticated
  USING (client_id = public.current_client_id())
  WITH CHECK (client_id = public.current_client_id());

CREATE POLICY "leads_tenant_delete" ON public.leads
  FOR DELETE TO authenticated
  USING (client_id = public.current_client_id());

-- 3. Hardened RLS Policies for inventory
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_select_inventory" ON public.inventory;
DROP POLICY IF EXISTS "dashboard_insert_inventory" ON public.inventory;
DROP POLICY IF EXISTS "dashboard_update_inventory" ON public.inventory;
DROP POLICY IF EXISTS "dashboard_delete_inventory" ON public.inventory;
DROP POLICY IF EXISTS "inventory_tenant_select" ON public.inventory;
DROP POLICY IF EXISTS "inventory_tenant_insert" ON public.inventory;
DROP POLICY IF EXISTS "inventory_tenant_update" ON public.inventory;
DROP POLICY IF EXISTS "inventory_tenant_delete" ON public.inventory;

CREATE POLICY "inventory_tenant_select" ON public.inventory
  FOR SELECT TO authenticated
  USING (client_id = public.current_client_id());

CREATE POLICY "inventory_tenant_insert" ON public.inventory
  FOR INSERT TO authenticated
  WITH CHECK (client_id = public.current_client_id());

CREATE POLICY "inventory_tenant_update" ON public.inventory
  FOR UPDATE TO authenticated
  USING (client_id = public.current_client_id())
  WITH CHECK (client_id = public.current_client_id());

CREATE POLICY "inventory_tenant_delete" ON public.inventory
  FOR DELETE TO authenticated
  USING (client_id = public.current_client_id());

-- 4. Hardened RLS Policies for executives
ALTER TABLE public.executives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_select_executives" ON public.executives;
DROP POLICY IF EXISTS "dashboard_insert_executives" ON public.executives;
DROP POLICY IF EXISTS "dashboard_update_executives" ON public.executives;
DROP POLICY IF EXISTS "dashboard_delete_executives" ON public.executives;
DROP POLICY IF EXISTS "executives_tenant_select" ON public.executives;
DROP POLICY IF EXISTS "executives_tenant_insert" ON public.executives;
DROP POLICY IF EXISTS "executives_tenant_update" ON public.executives;
DROP POLICY IF EXISTS "executives_tenant_delete" ON public.executives;

CREATE POLICY "executives_tenant_select" ON public.executives
  FOR SELECT TO authenticated
  USING (client_id = public.current_client_id());

CREATE POLICY "executives_tenant_insert" ON public.executives
  FOR INSERT TO authenticated
  WITH CHECK (client_id = public.current_client_id());

CREATE POLICY "executives_tenant_update" ON public.executives
  FOR UPDATE TO authenticated
  USING (client_id = public.current_client_id())
  WITH CHECK (client_id = public.current_client_id());

CREATE POLICY "executives_tenant_delete" ON public.executives
  FOR DELETE TO authenticated
  USING (client_id = public.current_client_id());

-- 5. Hardened RLS Policies for property_submissions
ALTER TABLE public.property_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_select_property_submissions" ON public.property_submissions;
DROP POLICY IF EXISTS "dashboard_insert_property_submissions" ON public.property_submissions;
DROP POLICY IF EXISTS "dashboard_update_property_submissions" ON public.property_submissions;
DROP POLICY IF EXISTS "dashboard_delete_property_submissions" ON public.property_submissions;
DROP POLICY IF EXISTS "property_submissions_tenant_select" ON public.property_submissions;
DROP POLICY IF EXISTS "property_submissions_tenant_update" ON public.property_submissions;
DROP POLICY IF EXISTS "property_submissions_tenant_delete" ON public.property_submissions;

CREATE POLICY "property_submissions_tenant_select" ON public.property_submissions
  FOR SELECT TO authenticated
  USING (client_id = public.current_client_id());

CREATE POLICY "property_submissions_tenant_update" ON public.property_submissions
  FOR UPDATE TO authenticated
  USING (client_id = public.current_client_id())
  WITH CHECK (client_id = public.current_client_id());

CREATE POLICY "property_submissions_tenant_delete" ON public.property_submissions
  FOR DELETE TO authenticated
  USING (client_id = public.current_client_id());

-- 6. Hardened RLS Policies for lead_events
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_select_lead_events" ON public.lead_events;
DROP POLICY IF EXISTS "dashboard_insert_lead_events" ON public.lead_events;
DROP POLICY IF EXISTS "lead_events_tenant_select" ON public.lead_events;

CREATE POLICY "lead_events_tenant_select" ON public.lead_events
  FOR SELECT TO authenticated
  USING (client_id = public.current_client_id());

-- 7. Hardened RLS Policies for clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_select_clients" ON public.clients;
DROP POLICY IF EXISTS "dashboard_update_clients" ON public.clients;
DROP POLICY IF EXISTS "clients_tenant_select" ON public.clients;
DROP POLICY IF EXISTS "clients_tenant_update" ON public.clients;

CREATE POLICY "clients_tenant_select" ON public.clients
  FOR SELECT TO authenticated
  USING (id = public.current_client_id());

CREATE POLICY "clients_tenant_update" ON public.clients
  FOR UPDATE TO authenticated
  USING (id = public.current_client_id())
  WITH CHECK (id = public.current_client_id());

-- 8. Insert Griham Realty Dummy Inventory (Flat, Villa, Commercial Office, Plot in Vadodara)
INSERT INTO public.inventory (
  property_id,
  client_id,
  project_name,
  configuration,
  bhk_num,
  property_category,
  location,
  city,
  price,
  status,
  carpet_area_sqft,
  super_built_up_area_sqft,
  possession_status,
  furnished_status,
  amenities,
  landmarks,
  image_urls,
  image_url,
  map_url,
  brochure_url,
  listing_type,
  price_negotiable
) VALUES
-- 1. FLAT in Alkapuri
(
  'PROP-GRI-001',
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'Griham Heights Luxury Residences',
  '3BHK',
  3,
  'FLAT',
  'Alkapuri',
  'Vadodara',
  9500000,
  'AVAILABLE',
  1450,
  1950,
  'Ready to Move',
  'Semi-Furnished',
  ARRAY['Clubhouse', 'Swimming Pool', 'Gymnasium', '24/7 Security', 'Covered Parking'],
  ARRAY['Alkapuri Club', 'Inox Cinema', 'Vadodara Central'],
  ARRAY['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80'],
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
  'https://maps.google.com/?q=Alkapuri+Vadodara',
  'https://yeiygfysijptjdepctnx.supabase.co/storage/v1/object/public/brochures/griham-heights-alkapuri.pdf',
  'SALE',
  false
),
-- 2. VILLA in Ankhol
(
  'PROP-GRI-002',
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'Griham Royal Palms Villa',
  '4BHK Villa',
  4,
  'VILLA',
  'Ankhol',
  'Vadodara',
  22500000,
  'AVAILABLE',
  2800,
  3600,
  'Under Construction',
  'Unfurnished',
  ARRAY['Private Garden', 'Clubhouse', '2 Car Parking', 'Security Surveillance', 'Gated Community'],
  ARRAY['Ankhol Gam', 'Expressway Junction', 'BAPS Chhatralaya'],
  ARRAY['https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80'],
  'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80',
  'https://maps.google.com/?q=Ankhol+Vadodara',
  'https://yeiygfysijptjdepctnx.supabase.co/storage/v1/object/public/brochures/griham-royal-palms.pdf',
  'SALE',
  false
),
-- 3. COMMERCIAL OFFICE in Alkapuri
(
  'PROP-GRI-003',
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'Griham Business Central',
  'Office Space',
  null,
  'COMMERCIAL',
  'Alkapuri',
  'Vadodara',
  6800000,
  'AVAILABLE',
  850,
  1200,
  'Ready to Move',
  'Furnished',
  ARRAY['High Speed Elevators', '100% Power Backup', 'Basement Parking', 'Cafeteria', 'Conference Hall'],
  ARRAY['RC Dutt Road', 'Alkapuri Railway Station Underpass', 'Sayajigunj Circle'],
  ARRAY['https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=800&q=80'],
  'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80',
  'https://maps.google.com/?q=RC+Dutt+Road+Alkapuri+Vadodara',
  'https://yeiygfysijptjdepctnx.supabase.co/storage/v1/object/public/brochures/griham-business-central.pdf',
  'SALE',
  false
),
-- 4. PLOT in Waghodia Road
(
  'PROP-GRI-004',
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'Griham Green Valley Enclave',
  'Residential Plot',
  null,
  'PLOT',
  'Waghodia Road',
  'Vadodara',
  3600000,
  'AVAILABLE',
  1800,
  1800,
  'Immediate Possession',
  'Unfurnished',
  ARRAY['Corner Plot', '40ft Wide Road', 'Underground Drainage', 'Street Lights', 'Water Supply'],
  ARRAY['Parul University Gate', 'Waghodia Chokdi', 'National Highway 48'],
  ARRAY['https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80'],
  'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80',
  'https://maps.google.com/?q=Waghodia+Road+Vadodara',
  'https://yeiygfysijptjdepctnx.supabase.co/storage/v1/object/public/brochures/griham-green-valley.pdf',
  'SALE',
  false
)
ON CONFLICT (property_id) DO UPDATE SET
  project_name = EXCLUDED.project_name,
  configuration = EXCLUDED.configuration,
  bhk_num = EXCLUDED.bhk_num,
  property_category = EXCLUDED.property_category,
  location = EXCLUDED.location,
  city = EXCLUDED.city,
  price = EXCLUDED.price,
  status = EXCLUDED.status,
  carpet_area_sqft = EXCLUDED.carpet_area_sqft,
  super_built_up_area_sqft = EXCLUDED.super_built_up_area_sqft,
  possession_status = EXCLUDED.possession_status,
  furnished_status = EXCLUDED.furnished_status,
  amenities = EXCLUDED.amenities,
  landmarks = EXCLUDED.landmarks,
  image_urls = EXCLUDED.image_urls,
  image_url = EXCLUDED.image_url,
  map_url = EXCLUDED.map_url,
  brochure_url = EXCLUDED.brochure_url,
  listing_type = EXCLUDED.listing_type,
  updated_at = now();
