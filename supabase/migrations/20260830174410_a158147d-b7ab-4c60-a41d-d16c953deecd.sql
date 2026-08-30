ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS zone_id integer REFERENCES public.zones(zone_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS route_id integer REFERENCES public.routes(route_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS street_id integer REFERENCES public.streets(street_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS properties_zone_id_idx ON public.properties(zone_id);
CREATE INDEX IF NOT EXISTS properties_route_id_idx ON public.properties(route_id);
CREATE INDEX IF NOT EXISTS properties_street_id_idx ON public.properties(street_id);