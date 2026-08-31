ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'digital';

ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_payment_type_check;

ALTER TABLE public.payment_methods
  ADD CONSTRAINT payment_methods_payment_type_check
  CHECK (payment_type IN ('digital', 'offline'));