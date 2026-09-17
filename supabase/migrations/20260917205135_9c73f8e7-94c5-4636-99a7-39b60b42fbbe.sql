
ALTER TABLE public.meter_tokens
  ADD COLUMN IF NOT EXISTS vending_software_id uuid REFERENCES public.vending_software(vending_software_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.meter_suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS provider_state text NOT NULL DEFAULT 'successful',
  ADD COLUMN IF NOT EXISTS provider_metadata jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

DO $$ BEGIN
  ALTER TABLE public.meter_tokens
    ADD CONSTRAINT meter_tokens_provider_state_check
    CHECK (provider_state IN ('pending','processing','successful','failed','reversed','cancelled','review'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS meter_tokens_idempotency_key_uidx
  ON public.meter_tokens (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vending_integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES public.meter_tokens(id) ON DELETE SET NULL,
  meter_id uuid REFERENCES public.meters(id) ON DELETE SET NULL,
  meter_number text,
  vending_software_id uuid REFERENCES public.vending_software(vending_software_id) ON DELETE SET NULL,
  software_code text,
  supplier_id uuid REFERENCES public.meter_suppliers(id) ON DELETE SET NULL,
  operation text NOT NULL,
  endpoint text,
  request_at timestamptz NOT NULL DEFAULT now(),
  response_at timestamptz,
  duration_ms integer,
  http_status integer,
  provider_result_code text,
  provider_reference text,
  success boolean NOT NULL DEFAULT false,
  error_code text,
  error_message text,
  request_payload jsonb,
  response_payload jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vending_integration_logs_meter_idx
  ON public.vending_integration_logs (meter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vending_integration_logs_token_idx
  ON public.vending_integration_logs (token_id);

GRANT SELECT, INSERT ON public.vending_integration_logs TO authenticated;
GRANT ALL ON public.vending_integration_logs TO service_role;

ALTER TABLE public.vending_integration_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read vending integration logs" ON public.vending_integration_logs;
CREATE POLICY "Admins read vending integration logs"
  ON public.vending_integration_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated write vending integration logs" ON public.vending_integration_logs;
CREATE POLICY "Authenticated write vending integration logs"
  ON public.vending_integration_logs FOR INSERT TO authenticated
  WITH CHECK (true);
