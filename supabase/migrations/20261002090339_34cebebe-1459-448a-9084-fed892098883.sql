CREATE TABLE public.vendor_sms_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sms_configuration_id uuid NOT NULL REFERENCES public.sms_configurations(id) ON DELETE CASCADE,
  api_url text, api_key text, api_secret text, username text, password text,
  sender_id text, account_id text, client_id text,
  is_enabled boolean NOT NULL DEFAULT false,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, sms_configuration_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_sms_configurations TO authenticated;
GRANT ALL ON public.vendor_sms_configurations TO service_role;
ALTER TABLE public.vendor_sms_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage vendor sms configurations" ON public.vendor_sms_configurations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE UNIQUE INDEX vendor_sms_one_enabled ON public.vendor_sms_configurations(vendor_id) WHERE is_enabled;
CREATE TRIGGER vendor_sms_configurations_updated_at BEFORE UPDATE ON public.vendor_sms_configurations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();