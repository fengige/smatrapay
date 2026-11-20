CREATE TABLE public.property_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  city text NOT NULL,
  premises text,
  property_type text,
  current_main_meter text,
  meters_needed text[] NOT NULL DEFAULT '{}',
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.property_enquiries TO authenticated;
GRANT ALL ON public.property_enquiries TO service_role;
ALTER TABLE public.property_enquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read property enquiries" ON public.property_enquiries FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX property_enquiries_created_idx ON public.property_enquiries (created_at DESC, id DESC);