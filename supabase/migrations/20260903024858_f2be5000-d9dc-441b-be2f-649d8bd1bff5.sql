CREATE TABLE public.lead_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL,
  lead_name text,
  executive_name text,
  action text NOT NULL,
  field text,
  old_value text,
  new_value text,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.lead_activity TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_activity TO authenticated;
GRANT ALL ON public.lead_activity TO service_role;

ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.lead_activity FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.lead_activity FOR INSERT WITH CHECK (true);

CREATE INDEX lead_activity_created_at_idx ON public.lead_activity (created_at DESC);
CREATE INDEX lead_activity_executive_idx ON public.lead_activity (executive_name);
CREATE INDEX lead_activity_lead_idx ON public.lead_activity (lead_id);