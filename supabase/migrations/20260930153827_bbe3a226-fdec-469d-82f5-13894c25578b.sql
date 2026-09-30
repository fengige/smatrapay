CREATE TABLE public.vending_software_api_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vending_software_id uuid NOT NULL UNIQUE REFERENCES public.vending_software(vending_software_id) ON DELETE CASCADE,
  api_pos_purchase text,
  api_login text,
  api_maintenance_clear_tamper text,
  api_maintenance_clear_credit text,
  api_maintenance_set_overdraft_limit text,
  api_company_name text,
  api_user_name text,
  api_password text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vending_software_api_settings TO authenticated;
GRANT ALL ON public.vending_software_api_settings TO service_role;

ALTER TABLE public.vending_software_api_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view vending software API settings"
ON public.vending_software_api_settings
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create vending software API settings"
ON public.vending_software_api_settings
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update vending software API settings"
ON public.vending_software_api_settings
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete vending software API settings"
ON public.vending_software_api_settings
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER vending_software_api_settings_set_updated_at
BEFORE UPDATE ON public.vending_software_api_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();