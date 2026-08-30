CREATE TABLE public.streets (
  street_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  route_id INTEGER NOT NULL,
  street_name VARCHAR(150) NOT NULL,
  postal_code VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT streets_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(route_id) ON DELETE CASCADE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.streets TO authenticated;
GRANT ALL ON public.streets TO service_role;

ALTER TABLE public.streets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view streets"
  ON public.streets
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage streets"
  ON public.streets
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_streets_updated_at
  BEFORE UPDATE ON public.streets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();