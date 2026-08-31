CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL,
  description text,
  environment text NOT NULL DEFAULT 'live',
  is_configured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payment_methods_name_key ON public.payment_methods (lower(name));
CREATE UNIQUE INDEX payment_methods_code_key ON public.payment_methods (lower(code));

GRANT SELECT ON public.payment_methods TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view payment methods"
  ON public.payment_methods FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert payment methods"
  ON public.payment_methods FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update payment methods"
  ON public.payment_methods FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete payment methods"
  ON public.payment_methods FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER payment_methods_set_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.payment_methods (name, code, description, environment, is_configured, is_active) VALUES
  ('Mpesa', 'mpesa', 'Safaricom M-Pesa mobile money collections', 'live', true, true),
  ('KCB Bank', 'kcb_bank', 'KCB Bank payment collections', 'live', false, false),
  ('NCBA Bank', 'ncba_bank', 'NCBA Bank payment collections', 'live', false, false),
  ('Equity Bank', 'equity_bank', 'Equity Bank payment collections', 'live', false, false),
  ('Co-operative Bank', 'cooperative_bank', 'Co-operative Bank payment collections', 'live', true, false),
  ('Sidian Bank', 'sidian_bank', 'Sidian Bank payment collections', 'live', true, false),
  ('Absa Bank', 'absa_bank', 'Absa Bank payment collections', 'live', false, false),
  ('Family Bank', 'family_bank', 'Family Bank payment collections', 'live', false, false),
  ('Ecobank Kenya', 'ecobank_kenya', 'Ecobank Kenya payment collections', 'live', false, false),
  ('Diamond Trust Bank (DTB)', 'dtb_bank', 'Diamond Trust Bank (DTB) payment collections', 'live', true, false);