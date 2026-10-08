CREATE TABLE public.payment_account_sidian_settings (
  account_id uuid PRIMARY KEY REFERENCES public.payment_method_accounts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  endpoint text NOT NULL,
  username text NOT NULL,
  password text NOT NULL,
  business_shortcode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.payment_account_sidian_settings TO service_role;
ALTER TABLE public.payment_account_sidian_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only manages Sidian credentials" ON public.payment_account_sidian_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX payment_account_sidian_settings_shortcode_idx ON public.payment_account_sidian_settings (business_shortcode);
CREATE TRIGGER payment_account_sidian_settings_updated_at BEFORE UPDATE ON public.payment_account_sidian_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();