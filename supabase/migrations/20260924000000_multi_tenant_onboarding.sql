-- ============================================================================
-- Multi-tenant onboarding: reconcile schema, bind executives to auth users,
-- bind profiles to clients, and lock every tenant table down with RLS.
--
-- This migration is written to be safe to run against the LIVE database even
-- though `clients` / `executives` / `client_integrations` were created there
-- outside of this migrations folder (they are re-declared here with
-- IF NOT EXISTS so the migration history catches up with reality without
-- clobbering existing data).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Core tenant tables (create if this is a fresh DB; no-op on the live DB
--    where they already exist with this same shape).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  email text,
  waba_id text,
  phone_number_id text,
  access_token text,
  display_phone_number text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.executives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  telegram_id text,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  webhook_url text,
  api_key text,
  forwarding_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- New columns needed for self-serve onboarding / Meta linking / labelling.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS fb_user_id text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS meta_signup_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS waba_business_id text;

ALTER TABLE public.executives ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.client_integrations ADD COLUMN IF NOT EXISTS label text;

CREATE UNIQUE INDEX IF NOT EXISTS executives_user_id_key ON public.executives (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS executives_email_lower_idx ON public.executives (lower(email));
CREATE INDEX IF NOT EXISTS executives_client_idx ON public.executives (client_id);
CREATE INDEX IF NOT EXISTS client_integrations_client_idx ON public.client_integrations (client_id);
CREATE INDEX IF NOT EXISTS clients_phone_number_id_idx ON public.clients (phone_number_id);
CREATE INDEX IF NOT EXISTS clients_waba_id_idx ON public.clients (waba_id);

-- updated_at triggers (helper already exists from an earlier migration).
DROP TRIGGER IF EXISTS set_updated_at ON public.clients;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.executives;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.executives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.client_integrations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. profiles: bind a signed-in user to a tenant.
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN role DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
      CHECK (role IS NULL OR role IN ('admin', 'sales_executive'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_client_idx ON public.profiles (client_id);

-- Users may only ever change their own display name / phone — never their
-- own role or client_id (that would be a privilege escalation). Admin/system
-- changes to role & client_id happen exclusively through service-role server
-- functions, which bypass column grants entirely.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;

-- Baseline "read/update own row" policies (idempotent — these likely already
-- exist on the live project from initial Supabase scaffolding, but are
-- re-declared here so a fresh database ends up with the same behaviour).
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. Multi-tenant scoping columns on leads / inventory / lead_activity.
-- ----------------------------------------------------------------------------

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_executive_id uuid REFERENCES public.executives(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS drip_stage integer DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_option_ids jsonb DEFAULT '[]'::jsonb;
-- Operational columns the dashboard writes to directly (kept as real columns,
-- not buried in metadata, so they can be filtered/updated atomically).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS alert_sent_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_human_contact_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sla_response_minutes integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS executive_notes text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS followup_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS leads_client_idx ON public.leads (client_id);
CREATE INDEX IF NOT EXISTS leads_assigned_executive_idx ON public.leads (assigned_executive_id);

ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS assigned_executive_id uuid REFERENCES public.executives(id) ON DELETE SET NULL;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS listing_type text;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS bhk_num integer;

CREATE INDEX IF NOT EXISTS inventory_client_idx ON public.inventory (client_id);
CREATE INDEX IF NOT EXISTS inventory_assigned_executive_idx ON public.inventory (assigned_executive_id);

ALTER TABLE public.lead_activity ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
-- Best-effort backfill for existing activity rows from their parent lead.
UPDATE public.lead_activity la
SET client_id = l.client_id
FROM public.leads l
WHERE la.client_id IS NULL AND la.lead_id = l.lead_id AND l.client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lead_activity_client_idx ON public.lead_activity (client_id);

-- ----------------------------------------------------------------------------
-- 4. Helper functions used by RLS policies.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_client_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_client_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_client_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_executive_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.executives WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_executive_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_executive_id() TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Signup trigger: no more "first user = admin". New users start
--    unassigned; if their email matches an executive record waiting to be
--    claimed, they are bound to that tenant automatically. Otherwise they
--    stay unassigned until they complete the onboarding flow (which creates
--    their own client/tenant and promotes them to admin).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_exec public.executives%ROWTYPE;
BEGIN
  SELECT * INTO matched_exec
  FROM public.executives
  WHERE lower(email) = lower(NEW.email) AND user_id IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  INSERT INTO public.profiles (id, email, full_name, role, client_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    CASE WHEN matched_exec.id IS NOT NULL THEN 'sales_executive' ELSE NULL END,
    matched_exec.client_id
  )
  ON CONFLICT (id) DO NOTHING;

  IF matched_exec.id IS NOT NULL THEN
    UPDATE public.executives SET user_id = NEW.id WHERE id = matched_exec.id;
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Row Level Security — every tenant table scoped by current_client_id().
-- ----------------------------------------------------------------------------

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.executives TO authenticated;
GRANT ALL ON public.executives TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_integrations TO authenticated;
GRANT ALL ON public.client_integrations TO service_role;

-- clients: a user can see/update only their own tenant's row. No app-level
-- insert/delete — those only ever happen via the service-role onboarding
-- server function.
DROP POLICY IF EXISTS "Members can view own client" ON public.clients;
CREATE POLICY "Members can view own client"
ON public.clients FOR SELECT TO authenticated
USING (id = public.current_client_id());

DROP POLICY IF EXISTS "Admins can update own client" ON public.clients;
CREATE POLICY "Admins can update own client"
ON public.clients FOR UPDATE TO authenticated
USING (id = public.current_client_id() AND public.is_admin(auth.uid()))
WITH CHECK (id = public.current_client_id() AND public.is_admin(auth.uid()));

-- executives: visible to the whole tenant, editable by admins only.
DROP POLICY IF EXISTS "Members can view own executives" ON public.executives;
CREATE POLICY "Members can view own executives"
ON public.executives FOR SELECT TO authenticated
USING (client_id = public.current_client_id());

DROP POLICY IF EXISTS "Admins can manage own executives" ON public.executives;
CREATE POLICY "Admins can manage own executives"
ON public.executives FOR ALL TO authenticated
USING (client_id = public.current_client_id() AND public.is_admin(auth.uid()))
WITH CHECK (client_id = public.current_client_id() AND public.is_admin(auth.uid()));

-- client_integrations (portal webhooks): visible to the tenant, editable by
-- admins only.
DROP POLICY IF EXISTS "Members can view own integrations" ON public.client_integrations;
CREATE POLICY "Members can view own integrations"
ON public.client_integrations FOR SELECT TO authenticated
USING (client_id = public.current_client_id());

DROP POLICY IF EXISTS "Admins can manage own integrations" ON public.client_integrations;
CREATE POLICY "Admins can manage own integrations"
ON public.client_integrations FOR ALL TO authenticated
USING (client_id = public.current_client_id() AND public.is_admin(auth.uid()))
WITH CHECK (client_id = public.current_client_id() AND public.is_admin(auth.uid()));

-- leads / inventory / lead_activity: strict tenant isolation. Every
-- authenticated member of a tenant (admin or sales executive) can read and
-- act on the tenant's rows; per-executive visibility inside a tenant stays
-- an application-layer filter (not an RLS boundary), matching how the
-- dashboard already assigns "my leads" today.
REVOKE ALL ON public.leads FROM anon;
REVOKE ALL ON public.inventory FROM anon;
REVOKE ALL ON public.lead_activity FROM anon;

DROP POLICY IF EXISTS "Tenant members access own leads" ON public.leads;
CREATE POLICY "Tenant members access own leads"
ON public.leads FOR ALL TO authenticated
USING (client_id = public.current_client_id())
WITH CHECK (client_id = public.current_client_id());

DROP POLICY IF EXISTS "Tenant members access own inventory" ON public.inventory;
CREATE POLICY "Tenant members access own inventory"
ON public.inventory FOR ALL TO authenticated
USING (client_id = public.current_client_id())
WITH CHECK (client_id = public.current_client_id());

DROP POLICY IF EXISTS "Enable read access for all users" ON public.lead_activity;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.lead_activity;
DROP POLICY IF EXISTS "Tenant members access own activity" ON public.lead_activity;
CREATE POLICY "Tenant members access own activity"
ON public.lead_activity FOR ALL TO authenticated
USING (client_id = public.current_client_id())
WITH CHECK (client_id = public.current_client_id());

-- ----------------------------------------------------------------------------
-- 7. Storage: brochures stay publicly viewable (they're shared with leads
--    over WhatsApp/Telegram) but can only be uploaded/replaced/deleted by an
--    authenticated member into their own tenant's folder, i.e. objects must
--    be stored at `<client_id>/...`.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public can manage brochures" ON storage.objects;

DROP POLICY IF EXISTS "Public can view brochures" ON storage.objects;
CREATE POLICY "Public can view brochures"
ON storage.objects FOR SELECT
USING (bucket_id = 'property-brochures');

DROP POLICY IF EXISTS "Tenants upload own brochures" ON storage.objects;
CREATE POLICY "Tenants upload own brochures"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'property-brochures'
  AND (storage.foldername(name))[1] = public.current_client_id()::text
);

DROP POLICY IF EXISTS "Tenants update own brochures" ON storage.objects;
CREATE POLICY "Tenants update own brochures"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'property-brochures'
  AND (storage.foldername(name))[1] = public.current_client_id()::text
);

DROP POLICY IF EXISTS "Tenants delete own brochures" ON storage.objects;
CREATE POLICY "Tenants delete own brochures"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'property-brochures'
  AND (storage.foldername(name))[1] = public.current_client_id()::text
);
