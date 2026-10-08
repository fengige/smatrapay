CREATE TABLE public.service_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX service_catalog_name_key ON public.service_catalog (lower(btrim(name)));
GRANT SELECT ON public.service_catalog TO authenticated;
GRANT ALL ON public.service_catalog TO service_role;
ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read catalog" ON public.service_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage catalog" ON public.service_catalog FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.service_catalog TO authenticated;
CREATE TRIGGER service_catalog_updated_at BEFORE UPDATE ON public.service_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.service_provider_services ADD COLUMN catalog_id uuid REFERENCES public.service_catalog(id) ON DELETE SET NULL;
CREATE INDEX service_provider_services_catalog_idx ON public.service_provider_services (catalog_id);

INSERT INTO public.service_catalog (name, description) VALUES
 ('Meter Installation','Installing new prepaid meters at customer premises'),
 ('Meter Replacement','Removing faulty meters and fitting replacements'),
 ('Meter Repair','Diagnosing and repairing faulty prepaid meters'),
 ('Meter Inspection','Site inspection, readings and tamper checks'),
 ('Electrical Wiring','Electrical wiring and connection works'),
 ('Plumbing','Water meter plumbing and pipework'),
 ('Token & Keypad Support','Resolving token entry and keypad problems'),
 ('Communication Fault Repair','Restoring meter communication and connectivity')
ON CONFLICT DO NOTHING;
INSERT INTO public.service_catalog (name, description)
SELECT DISTINCT ON (lower(btrim(service_name))) btrim(service_name), description
FROM public.service_provider_services ORDER BY lower(btrim(service_name)), created_at
ON CONFLICT DO NOTHING;
UPDATE public.service_provider_services s SET catalog_id = c.id
FROM public.service_catalog c WHERE lower(btrim(s.service_name)) = lower(btrim(c.name));