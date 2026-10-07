ALTER TABLE public.meter_tokens
  ADD COLUMN IF NOT EXISTS net_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS commission_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS commission_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS vat_on_commission_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS vat_on_commission_amount numeric(15,2);