CREATE TYPE public.sms_delivery_status AS ENUM ('queued','sent','failed');

CREATE TABLE public.token_sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.meter_tokens(id) ON DELETE CASCADE,
  phone text NOT NULL,
  status public.sms_delivery_status NOT NULL DEFAULT 'queued',
  error text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX token_sms_logs_token_id_created_at_idx ON public.token_sms_logs (token_id, created_at DESC);

GRANT SELECT, INSERT ON public.token_sms_logs TO authenticated;
GRANT ALL ON public.token_sms_logs TO service_role;

ALTER TABLE public.token_sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view token sms logs" ON public.token_sms_logs
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert token sms logs" ON public.token_sms_logs
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners can view their token sms logs" ON public.token_sms_logs
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.meter_tokens t
      JOIN public.meters m ON m.id = t.meter_id
      WHERE t.id = token_sms_logs.token_id
        AND (m.landlord_id = auth.uid() OR m.agent_id = auth.uid())
    )
  );

CREATE TRIGGER token_sms_logs_set_updated_at
  BEFORE UPDATE ON public.token_sms_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();