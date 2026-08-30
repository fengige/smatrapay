CREATE TABLE public.routes (
  route_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zone_id INTEGER NOT NULL,
  route_code VARCHAR(20) NOT NULL UNIQUE,
  route_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT routes_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(zone_id) ON DELETE CASCADE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.routes TO authenticated;
GRANT ALL ON public.routes TO service_role;

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view routes"
  ON public.routes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage routes"
  ON public.routes
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_routes_updated_at
  BEFORE UPDATE ON public.routes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();