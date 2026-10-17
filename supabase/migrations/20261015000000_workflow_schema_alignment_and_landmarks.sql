-- Migration: workflow_schema_alignment_and_landmarks
-- Aligns inventory with landmarks, city, assigned executive, and aligns leads with 6-field qualification and workflow tracking.

ALTER TABLE public.inventory 
  ADD COLUMN IF NOT EXISTS landmarks text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS city text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assigned_executive_id uuid REFERENCES public.executives(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_landmarks ON public.inventory USING gin(landmarks);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON public.inventory (location);

ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS requirement text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS purpose text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS timeline text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS site_visit_datetime timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_option_ids text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS alert_sent_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bot_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_followup_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_client_state ON public.leads (client_id, state);
CREATE INDEX IF NOT EXISTS idx_leads_followup ON public.leads (last_followup_at, bot_active);
