CREATE OR REPLACE FUNCTION public.can_manage_property_landlords(p_property uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public, private AS $$
  SELECT private.has_role(auth.uid(),'admin') OR (private.has_role(auth.uid(),'vendor') AND (
    EXISTS(SELECT 1 FROM public.properties p WHERE p.id=p_property AND (
      p.created_by=auth.uid() OR (p.owner_type='vendor' AND p.landlord_id=auth.uid())
      OR p.zone_id IN (SELECT z.zone_id FROM private.vendor_zone_ids(auth.uid()) z(zone_id))))
    OR EXISTS(SELECT 1 FROM private.vendor_scope_property_ids(auth.uid()) s(property_id) WHERE s.property_id=p_property)))
$$;

CREATE OR REPLACE FUNCTION public.is_landlord_account(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public, private AS $$ SELECT private.has_role(p_user,'landlord') $$;
REVOKE ALL ON FUNCTION public.is_landlord_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_landlord_account(uuid) TO authenticated;

DROP POLICY IF EXISTS property_landlords_insert ON public.property_landlords;
CREATE POLICY property_landlords_insert ON public.property_landlords FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_property_landlords(property_id) AND assigned_by = auth.uid() AND public.is_landlord_account(landlord_id));