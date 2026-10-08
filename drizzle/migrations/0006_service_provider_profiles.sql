CREATE TABLE public.service_provider_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  middle_name text,
  last_name text NOT NULL,
  business_name text,
  country text,
  county text,
  city text,
  postal_address text,
  logo_url text,
  deleted_at timestamptz,
  deleted_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_provider_profiles TO authenticated;
GRANT ALL ON public.service_provider_profiles TO service_role;
ALTER TABLE public.service_provider_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage service provider profiles" ON public.service_provider_profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Providers read own profile" ON public.service_provider_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER trg_spp_updated BEFORE UPDATE ON public.service_provider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.service_provider_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.service_provider_profiles(user_id) ON DELETE CASCADE,
  service_name text NOT NULL CHECK (length(btrim(service_name)) BETWEEN 1 AND 120),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX service_provider_services_unique_name
  ON public.service_provider_services (provider_id, lower(btrim(service_name)));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_provider_services TO authenticated;
GRANT ALL ON public.service_provider_services TO service_role;
ALTER TABLE public.service_provider_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage provider services" ON public.service_provider_services
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Providers read own services" ON public.service_provider_services
  FOR SELECT TO authenticated USING (provider_id = auth.uid());
CREATE TRIGGER trg_sps_updated BEFORE UPDATE ON public.service_provider_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();