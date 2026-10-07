ALTER TABLE public.meters
  ADD COLUMN IF NOT EXISTS commission_percentage numeric(5,2) CHECK (commission_percentage IS NULL OR (commission_percentage >= 0 AND commission_percentage <= 100)),
  ADD COLUMN IF NOT EXISTS vat_on_commission_percentage numeric(5,2) CHECK (vat_on_commission_percentage IS NULL OR (vat_on_commission_percentage >= 0 AND vat_on_commission_percentage <= 100));