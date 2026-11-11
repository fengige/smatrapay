CREATE OR REPLACE FUNCTION public.can_manage_property_landlords(p_property uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'vendor') AND (
    EXISTS(SELECT 1 FROM properties p WHERE p.id=p_property AND (p.created_by=auth.uid() OR (p.owner_type='vendor' AND p.landlord_id=auth.uid())))
    OR EXISTS(SELECT 1 FROM private.vendor_scope_property_ids(auth.uid()) s(property_id) WHERE s.property_id=p_property)))
$$;