CREATE OR REPLACE FUNCTION public.vendor_resident_list_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private
AS $$
 SELECT DISTINCT u.id FROM public.users u
 JOIN public.user_roles r ON r.user_id=u.id AND r.role='resident'::public.app_role
 WHERE private.has_role(auth.uid(),'vendor'::public.app_role)
 AND (u.created_by=auth.uid() OR EXISTS (
   SELECT 1 FROM public.unit_assignments a
   JOIN public.units un ON un.id=a.unit_id
   JOIN public.properties p ON p.id=un.property_id
   WHERE a.user_id=u.id AND a.role='resident' AND a.end_date IS NULL
   AND (un.id IN (SELECT s.unit_id FROM private.vendor_scope_unit_ids(auth.uid()) s)
        OR p.created_by=auth.uid() OR (p.owner_type='vendor' AND p.landlord_id=auth.uid()))
 ));
$$;
REVOKE ALL ON FUNCTION public.vendor_resident_list_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_resident_list_ids() TO authenticated, service_role;
CREATE POLICY "Vendors can read eligible resident profiles" ON public.users FOR SELECT TO authenticated
USING (id IN (SELECT user_id FROM public.vendor_resident_list_ids()));
CREATE POLICY "Vendors can read assignments of own properties" ON public.unit_assignments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'vendor') AND EXISTS (
 SELECT 1 FROM public.units un JOIN public.properties p ON p.id=un.property_id
 WHERE un.id=unit_assignments.unit_id AND (p.created_by=auth.uid() OR (p.owner_type='vendor' AND p.landlord_id=auth.uid()))
));