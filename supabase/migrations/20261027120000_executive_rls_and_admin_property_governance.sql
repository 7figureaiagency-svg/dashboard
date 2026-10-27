-- Migration: Executive RLS Hardening & Admin-Only Property Submissions Governance
-- Date: 2026-10-27
-- Description:
-- 1. Adds user_id to public.executives referencing auth.users(id).
-- 2. Creates public.current_executive_id() to resolve the authenticated user's executive record.
-- 3. Creates public.is_admin() to verify if the authenticated user has an 'admin' role in public.profiles.
-- 4. Recreates leads RLS policies (SELECT and UPDATE) to enforce executive isolation (sales executives see only assigned leads or unassigned leads; admins see all).
-- 5. Recreates property_submissions RLS policies (SELECT, UPDATE, DELETE) strictly for admins within the current tenant.

-- 1. Add user_id to executives if not present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'executives' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.executives ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS executives_user_id_idx ON public.executives (user_id);

-- 2. Security definer function to return current executive ID from auth.uid()
CREATE OR REPLACE FUNCTION public.current_executive_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.executives
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_executive_id() TO authenticated, anon;

-- 3. Security definer function to check if current authenticated user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()::text AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- 4. Hardened RLS policies for leads
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_select_leads" ON public.leads;
DROP POLICY IF EXISTS "dashboard_update_leads" ON public.leads;
DROP POLICY IF EXISTS "tenant_isolation_select" ON public.leads;
DROP POLICY IF EXISTS "leads_tenant_select" ON public.leads;
DROP POLICY IF EXISTS "leads_tenant_update" ON public.leads;

CREATE POLICY "dashboard_select_leads" ON public.leads
FOR SELECT TO authenticated
USING (
  client_id = public.current_client_id() AND (
    public.is_admin()
    OR assigned_executive_id = public.current_executive_id()
    OR assigned_executive_id IS NULL
  )
);

CREATE POLICY "dashboard_update_leads" ON public.leads
FOR UPDATE TO authenticated
USING (
  client_id = public.current_client_id() AND (
    public.is_admin()
    OR assigned_executive_id = public.current_executive_id()
    OR assigned_executive_id IS NULL
  )
)
WITH CHECK (
  client_id = public.current_client_id() AND (
    public.is_admin()
    OR assigned_executive_id = public.current_executive_id()
    OR assigned_executive_id IS NULL
  )
);

-- 5. Hardened RLS policies for property_submissions — STRICT ADMIN ONLY
ALTER TABLE public.property_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_select_property_submissions" ON public.property_submissions;
DROP POLICY IF EXISTS "dashboard_update_property_submissions" ON public.property_submissions;
DROP POLICY IF EXISTS "dashboard_delete_property_submissions" ON public.property_submissions;
DROP POLICY IF EXISTS "anon_select_property_submissions" ON public.property_submissions;
DROP POLICY IF EXISTS "property_submissions_tenant_select" ON public.property_submissions;
DROP POLICY IF EXISTS "property_submissions_tenant_update" ON public.property_submissions;
DROP POLICY IF EXISTS "property_submissions_tenant_delete" ON public.property_submissions;

CREATE POLICY "dashboard_select_property_submissions" ON public.property_submissions
FOR SELECT TO authenticated
USING (client_id = public.current_client_id() AND public.is_admin());

CREATE POLICY "dashboard_update_property_submissions" ON public.property_submissions
FOR UPDATE TO authenticated
USING (client_id = public.current_client_id() AND public.is_admin())
WITH CHECK (client_id = public.current_client_id() AND public.is_admin());

CREATE POLICY "dashboard_delete_property_submissions" ON public.property_submissions
FOR DELETE TO authenticated
USING (client_id = public.current_client_id() AND public.is_admin());
