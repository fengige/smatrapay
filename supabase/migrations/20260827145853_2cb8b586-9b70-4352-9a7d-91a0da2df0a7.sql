CREATE TYPE public.property_status AS ENUM ('active', 'archived');
CREATE TYPE public.unit_status AS ENUM ('vacant', 'occupied', 'maintenance', 'archived');
CREATE TYPE public.assignment_role AS ENUM ('resident', 'landlord');

CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  country text,
  postal_code text,
  description text,
  status public.property_status NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX properties_name_key ON public.properties (lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view properties" ON public.properties FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert properties" ON public.properties FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update properties" ON public.properties FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete properties" ON public.properties FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_number text NOT NULL,
  building text,
  unit_type text,
  bedrooms integer,
  floor text,
  status public.unit_status NOT NULL DEFAULT 'vacant',
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, unit_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view units" ON public.units FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert units" ON public.units FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update units" ON public.units FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete units" ON public.units FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.unit_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.assignment_role NOT NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX unit_assignments_unit_idx ON public.unit_assignments (unit_id);
CREATE INDEX unit_assignments_user_idx ON public.unit_assignments (user_id);
CREATE UNIQUE INDEX unit_assignments_current_key
  ON public.unit_assignments (unit_id, user_id, role)
  WHERE end_date IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unit_assignments TO authenticated;
GRANT ALL ON public.unit_assignments TO service_role;
ALTER TABLE public.unit_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view assignments" ON public.unit_assignments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own assignments" ON public.unit_assignments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can insert assignments" ON public.unit_assignments FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update assignments" ON public.unit_assignments FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete assignments" ON public.unit_assignments FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER properties_set_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER units_set_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER unit_assignments_set_updated_at BEFORE UPDATE ON public.unit_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.properties (name, city, country, status)
SELECT trim(u.property), NULLIF(max(u.building), ''), 'Kenya', 'active'::public.property_status
FROM public.users u
WHERE u.property IS NOT NULL AND trim(u.property) <> ''
GROUP BY trim(u.property)
ON CONFLICT DO NOTHING;

INSERT INTO public.units (property_id, unit_number, building, status)
SELECT DISTINCT p.id, trim(u.unit_number), NULLIF(trim(coalesce(u.building, '')), ''), 'occupied'::public.unit_status
FROM public.users u
JOIN public.properties p ON lower(p.name) = lower(trim(u.property))
WHERE u.unit_number IS NOT NULL AND trim(u.unit_number) <> ''
ON CONFLICT (property_id, unit_number) DO NOTHING;

INSERT INTO public.unit_assignments (unit_id, user_id, role, start_date)
SELECT un.id, u.id, r.role::text::public.assignment_role, COALESCE(u.move_in_date, u.created_at::date)
FROM public.users u
JOIN public.properties p ON lower(p.name) = lower(trim(u.property))
JOIN public.units un ON un.property_id = p.id AND un.unit_number = trim(u.unit_number)
JOIN public.user_roles r ON r.user_id = u.id AND r.role IN ('resident', 'landlord')
WHERE u.unit_number IS NOT NULL AND trim(u.unit_number) <> ''
ON CONFLICT DO NOTHING;