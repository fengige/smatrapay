CREATE OR REPLACE FUNCTION private.vendor_scope_unit_ids(_vendor uuid)
RETURNS TABLE(unit_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT u.id
  FROM public.units u
  JOIN public.properties p ON p.id = u.property_id
  WHERE p.zone_id IN (SELECT z.zone_id FROM private.vendor_zone_ids(_vendor) z(zone_id))
  UNION
  SELECT vu.unit_id FROM private.vendor_unit_ids(_vendor) vu(unit_id)
$$;

CREATE OR REPLACE FUNCTION private.vendor_scope_property_ids(_vendor uuid)
RETURNS TABLE(property_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT DISTINCT u.property_id
  FROM public.units u
  WHERE u.id IN (SELECT s.unit_id FROM private.vendor_scope_unit_ids(_vendor) s(unit_id))
$$;

CREATE OR REPLACE FUNCTION private.vendor_scope_resident_ids(_vendor uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT DISTINCT a.user_id
  FROM public.unit_assignments a
  WHERE a.role = 'resident'
    AND a.unit_id IN (SELECT s.unit_id FROM private.vendor_scope_unit_ids(_vendor) s(unit_id))
$$;

DROP POLICY IF EXISTS "Vendors can view their units" ON public.units;
CREATE POLICY "Vendors can view their units" ON public.units FOR SELECT TO authenticated
USING (id IN (SELECT s.unit_id FROM private.vendor_scope_unit_ids(auth.uid()) s(unit_id)));

DROP POLICY IF EXISTS "Vendors can view their properties" ON public.properties;
CREATE POLICY "Vendors can view their properties" ON public.properties FOR SELECT TO authenticated
USING (id IN (SELECT s.property_id FROM private.vendor_scope_property_ids(auth.uid()) s(property_id)));

DROP POLICY IF EXISTS "Vendors can view their unit assignments" ON public.unit_assignments;
CREATE POLICY "Vendors can view their unit assignments" ON public.unit_assignments FOR SELECT TO authenticated
USING (unit_id IN (SELECT s.unit_id FROM private.vendor_scope_unit_ids(auth.uid()) s(unit_id)));

DROP POLICY IF EXISTS "Vendors can view their residents" ON public.users;
CREATE POLICY "Vendors can view their residents" ON public.users FOR SELECT TO authenticated
USING (id IN (SELECT s.user_id FROM private.vendor_scope_resident_ids(auth.uid()) s(user_id)));

DROP POLICY IF EXISTS "Vendors can view resident payments" ON public.payments;
CREATE POLICY "Vendors can view resident payments" ON public.payments FOR SELECT TO authenticated
USING (payee_id IN (SELECT s.user_id FROM private.vendor_scope_resident_ids(auth.uid()) s(user_id)));