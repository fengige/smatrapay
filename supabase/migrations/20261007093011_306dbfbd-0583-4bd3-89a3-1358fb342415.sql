CREATE TABLE public.pricing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  commission_percentage numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
  vat_on_commission_percentage numeric(5,2) NOT NULL DEFAULT 0 CHECK (vat_on_commission_percentage >= 0 AND vat_on_commission_percentage <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.pricing_settings TO authenticated;
GRANT ALL ON public.pricing_settings TO service_role;
ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pricing settings" ON public.pricing_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert pricing settings" ON public.pricing_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update pricing settings" ON public.pricing_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.pricing_settings (id) VALUES (true);

CREATE TABLE public.pricing_settings_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field text NOT NULL,
  previous_value numeric(5,2),
  new_value numeric(5,2),
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pricing_settings_history TO authenticated;
GRANT ALL ON public.pricing_settings_history TO service_role;
ALTER TABLE public.pricing_settings_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pricing history" ON public.pricing_settings_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_pricing_settings_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  IF NEW.commission_percentage IS DISTINCT FROM OLD.commission_percentage THEN
    INSERT INTO public.pricing_settings_history(field, previous_value, new_value, changed_by)
    VALUES ('commission_percentage', OLD.commission_percentage, NEW.commission_percentage, auth.uid());
  END IF;
  IF NEW.vat_on_commission_percentage IS DISTINCT FROM OLD.vat_on_commission_percentage THEN
    INSERT INTO public.pricing_settings_history(field, previous_value, new_value, changed_by)
    VALUES ('vat_on_commission_percentage', OLD.vat_on_commission_percentage, NEW.vat_on_commission_percentage, auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pricing_settings_audit BEFORE UPDATE ON public.pricing_settings FOR EACH ROW EXECUTE FUNCTION public.log_pricing_settings_change();