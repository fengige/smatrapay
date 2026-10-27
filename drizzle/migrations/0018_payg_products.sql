CREATE TABLE public.payg_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  image_path text,
  price numeric(14,2) CHECK (price IS NULL OR price >= 0),
  down_payment numeric(14,2) CHECK (down_payment IS NULL OR down_payment >= 0),
  instalment_amount numeric(14,2) CHECK (instalment_amount IS NULL OR instalment_amount >= 0),
  instalment_frequency text CHECK (instalment_frequency IS NULL OR instalment_frequency IN ('daily','weekly','monthly')),
  instalment_count integer CHECK (instalment_count IS NULL OR instalment_count BETWEEN 1 AND 1000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payg_products_vendor_idx ON public.payg_products(vendor_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payg_products TO authenticated;
GRANT ALL ON public.payg_products TO service_role;
ALTER TABLE public.payg_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vendors manage own payg products" ON public.payg_products FOR ALL TO authenticated
  USING (vendor_id = auth.uid() AND public.has_role(auth.uid(), 'vendor'))
  WITH CHECK (vendor_id = auth.uid() AND public.has_role(auth.uid(), 'vendor'));
CREATE POLICY "Admins read payg products" ON public.payg_products FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER payg_products_updated BEFORE UPDATE ON public.payg_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Vendors upload own payg images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payg-products' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_role(auth.uid(), 'vendor'));
CREATE POLICY "Vendors read own payg images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payg-products' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Vendors delete own payg images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payg-products' AND (storage.foldername(name))[1] = auth.uid()::text);