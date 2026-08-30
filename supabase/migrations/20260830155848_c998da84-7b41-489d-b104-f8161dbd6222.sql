CREATE TYPE public.meter_token_status AS ENUM ('issued', 'revoked', 'expired');
CREATE TYPE public.meter_token_action AS ENUM ('credit', 'key_change', 'clear_tamper', 'clear_credit');

CREATE TABLE public.meter_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  action public.meter_token_action NOT NULL DEFAULT 'credit',
  token text NOT NULL,
  units numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  reference text,
  customer_phone text,
  sms_requested boolean NOT NULL DEFAULT false,
  status public.meter_token_status NOT NULL DEFAULT 'issued',
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days'),
  issued_by uuid,
  revoked_by uuid,
  revoked_at timestamp with time zone,
  revoke_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX meter_tokens_meter_id_idx ON public.meter_tokens (meter_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.meter_tokens TO authenticated;
GRANT ALL ON public.meter_tokens TO service_role;

ALTER TABLE public.meter_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view meter tokens" ON public.meter_tokens
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert meter tokens" ON public.meter_tokens
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update meter tokens" ON public.meter_tokens
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners can view their meter tokens" ON public.meter_tokens
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.meters m
    WHERE m.id = meter_tokens.meter_id
      AND (m.landlord_id = auth.uid() OR m.agent_id = auth.uid())
  ));

CREATE TRIGGER meter_tokens_set_updated_at
  BEFORE UPDATE ON public.meter_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();