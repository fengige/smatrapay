ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS owner_type text NOT NULL DEFAULT 'landlord';

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_owner_type_check;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_owner_type_check
  CHECK (owner_type IN ('landlord', 'agent', 'vendor'));