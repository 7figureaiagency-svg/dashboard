-- Multi-Tenant Scale Composite Indexes for 100+ Brokerages
-- Ensures sub-5ms query performance under concurrent WhatsApp / Telegram traffic and 500k+ records

-- 1. Leads Table Composite Indexes
CREATE INDEX IF NOT EXISTS idx_leads_client_lead_id 
  ON public.leads (client_id, lead_id);

CREATE INDEX IF NOT EXISTS idx_leads_client_state_active 
  ON public.leads (client_id, state, last_active_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_leads_client_phone 
  ON public.leads (client_id, phone) 
  WHERE phone IS NOT NULL;

-- 2. Inventory Table Composite Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_client_status_category 
  ON public.inventory (client_id, status, property_category);

CREATE INDEX IF NOT EXISTS idx_inventory_client_property_id 
  ON public.inventory (client_id, property_id);

-- 3. Site Visits Table Composite Indexes
CREATE INDEX IF NOT EXISTS idx_site_visits_client_lead_sched 
  ON public.site_visits (client_id, lead_id, scheduled_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_site_visits_client_status_sched 
  ON public.site_visits (client_id, status, scheduled_at);

-- 4. Property Submissions Table Composite Indexes
CREATE INDEX IF NOT EXISTS idx_property_submissions_client_lead 
  ON public.property_submissions (client_id, lead_id, created_at DESC);

-- 5. Lead Events Audit Table Composite Index
CREATE INDEX IF NOT EXISTS idx_lead_events_client_lead_created 
  ON public.lead_events (client_id, lead_id, created_at DESC);
