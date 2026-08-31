ALTER TABLE public.payment_method_configurations
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.payment_method_configurations
  DROP CONSTRAINT IF EXISTS payment_method_configurations_payment_method_id_environment_key;

CREATE UNIQUE INDEX IF NOT EXISTS pmc_global_unique
  ON public.payment_method_configurations (payment_method_id, environment)
  WHERE owner_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pmc_owner_unique
  ON public.payment_method_configurations (payment_method_id, environment, owner_id)
  WHERE owner_id IS NOT NULL;