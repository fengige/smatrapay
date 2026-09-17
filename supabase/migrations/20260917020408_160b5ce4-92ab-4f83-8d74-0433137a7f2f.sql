CREATE TABLE public.meter_supplier_api_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_supplier_id uuid NOT NULL UNIQUE REFERENCES public.meter_suppliers(id) ON DELETE CASCADE,
  api_pos_purchase text,
  api_login text,
  api_maintenance_clear_tamper text,
  api_maintenance_clear_credit text,
  api_maintenance_set_overdraft_limit text,
  api_company_name text,
  api_user_name text,
  api_password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meter_supplier_api_settings TO authenticated;
GRANT ALL ON public.meter_supplier_api_settings TO service_role;

ALTER TABLE public.meter_supplier_api_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage supplier api settings"
ON public.meter_supplier_api_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER meter_supplier_api_settings_set_updated_at
BEFORE UPDATE ON public.meter_supplier_api_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.meter_supplier_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.meter_suppliers(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.meter_supplier_audit_logs TO authenticated;
GRANT ALL ON public.meter_supplier_audit_logs TO service_role;

ALTER TABLE public.meter_supplier_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view supplier audit logs"
ON public.meter_supplier_audit_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins write supplier audit logs"
ON public.meter_supplier_audit_logs FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX meter_supplier_audit_logs_supplier_idx ON public.meter_supplier_audit_logs(supplier_id, created_at DESC);