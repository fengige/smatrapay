CREATE TABLE public.vendor_tenant_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resident_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_tenant_applications TO authenticated;
GRANT ALL ON public.vendor_tenant_applications TO service_role;

ALTER TABLE public.vendor_tenant_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors manage their own tenant applications"
ON public.vendor_tenant_applications FOR ALL TO authenticated
USING (vendor_id = auth.uid() AND public.has_role(auth.uid(), 'vendor'))
WITH CHECK (vendor_id = auth.uid() AND public.has_role(auth.uid(), 'vendor'));

CREATE POLICY "Admins view tenant applications"
ON public.vendor_tenant_applications FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_vendor_tenant_applications_updated_at
BEFORE UPDATE ON public.vendor_tenant_applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX vendor_tenant_applications_vendor_idx ON public.vendor_tenant_applications (vendor_id, updated_at DESC);