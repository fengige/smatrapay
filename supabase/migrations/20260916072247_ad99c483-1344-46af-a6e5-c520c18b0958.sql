ALTER TABLE public.zones
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid;

WITH m AS (
  SELECT p.zone_id AS zid, (mt.vendor_id)::uuid AS vid
  FROM public.meters mt
  JOIN public.units u ON u.id = mt.unit_id
  JOIN public.properties p ON p.id = u.property_id
  WHERE p.zone_id IS NOT NULL
    AND mt.vendor_id IS NOT NULL
    AND mt.vendor_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
), agg AS (
  SELECT zid, count(DISTINCT vid) AS c, (array_agg(DISTINCT vid))[1] AS vid FROM m GROUP BY zid
)
UPDATE public.zones z
SET vendor_id = agg.vid
FROM agg
WHERE agg.zid = z.zone_id AND agg.c = 1 AND z.vendor_id IS NULL;

CREATE INDEX IF NOT EXISTS zones_vendor_id_idx ON public.zones(vendor_id);

CREATE OR REPLACE FUNCTION private.vendor_can_access_zone(_vendor uuid, _zone integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.zones z
    WHERE z.zone_id = _zone AND z.vendor_id = _vendor
  ) OR EXISTS (
    SELECT 1 FROM private.vendor_zone_ids(_vendor) v(zone_id) WHERE v.zone_id = _zone
  );
$$;

CREATE OR REPLACE FUNCTION public.vendor_can_access_zone(_vendor uuid, _zone integer)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT private.vendor_can_access_zone(_vendor, _zone);
$$;

DROP POLICY IF EXISTS "Anyone can view zones" ON public.zones;
DROP POLICY IF EXISTS "Vendors can manage zones" ON public.zones;
DROP POLICY IF EXISTS "Vendors can view their zones" ON public.zones;

CREATE POLICY "Non-vendors can view zones"
ON public.zones FOR SELECT TO authenticated
USING (NOT has_role(auth.uid(), 'vendor'::app_role));

CREATE POLICY "Vendors can view their zones"
ON public.zones FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'vendor'::app_role)
  AND private.vendor_can_access_zone(auth.uid(), zone_id)
);

CREATE POLICY "Vendors can create their zones"
ON public.zones FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'vendor'::app_role) AND vendor_id = auth.uid());

CREATE POLICY "Vendors can update their zones"
ON public.zones FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'vendor'::app_role) AND vendor_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'vendor'::app_role) AND vendor_id = auth.uid());

CREATE POLICY "Vendors can delete their zones"
ON public.zones FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'vendor'::app_role) AND vendor_id = auth.uid());

DROP POLICY IF EXISTS "Vendors can manage routes" ON public.routes;
DROP POLICY IF EXISTS "Anyone can view routes" ON public.routes;

CREATE POLICY "Non-vendors can view routes"
ON public.routes FOR SELECT TO authenticated
USING (NOT has_role(auth.uid(), 'vendor'::app_role));

CREATE POLICY "Vendors can manage their routes"
ON public.routes FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'vendor'::app_role)
  AND private.vendor_can_access_zone(auth.uid(), zone_id)
)
WITH CHECK (
  has_role(auth.uid(), 'vendor'::app_role)
  AND private.vendor_can_access_zone(auth.uid(), zone_id)
);

DROP POLICY IF EXISTS "Vendors can manage streets" ON public.streets;
DROP POLICY IF EXISTS "Anyone can view streets" ON public.streets;

CREATE POLICY "Non-vendors can view streets"
ON public.streets FOR SELECT TO authenticated
USING (NOT has_role(auth.uid(), 'vendor'::app_role));

CREATE POLICY "Vendors can manage their streets"
ON public.streets FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'vendor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.route_id = streets.route_id
      AND private.vendor_can_access_zone(auth.uid(), r.zone_id)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'vendor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.route_id = streets.route_id
      AND private.vendor_can_access_zone(auth.uid(), r.zone_id)
  )
);
