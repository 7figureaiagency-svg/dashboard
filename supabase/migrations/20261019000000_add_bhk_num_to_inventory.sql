-- Migration: add_bhk_num_to_inventory
-- Ensures public.inventory has top-level bhk_num column with index and backfills from configuration/attributes.

ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS bhk_num integer;
CREATE INDEX IF NOT EXISTS idx_inventory_bhk_num ON public.inventory (bhk_num);

-- Backfill bhk_num for existing inventory records
UPDATE public.inventory
SET bhk_num = COALESCE(
  (regexp_match(configuration, '(\d+)\s*BHK', 'i'))[1]::integer,
  CASE WHEN (attributes->>'bhk_num') ~ '^\d+$'
       THEN (attributes->>'bhk_num')::integer
       ELSE NULL END
)
WHERE bhk_num IS NULL;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
