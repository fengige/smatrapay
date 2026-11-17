CREATE OR REPLACE FUNCTION public.vendor_resident_list_ids()
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
 SELECT DISTINCT u.id FROM public.users u
 JOIN public.user_roles r ON r.user_id=u.id AND r.role='resident'::public.app_role
 WHERE private.has_role(auth.uid(),'vendor'::public.app_role)
 AND NOT EXISTS (
   SELECT 1 FROM public.user_roles r2
   WHERE r2.user_id=u.id AND r2.role <> 'resident'::public.app_role
 )
 AND (u.created_by=auth.uid() OR EXISTS (
   SELECT 1 FROM public.unit_assignments a
   JOIN public.units un ON un.id=a.unit_id
   JOIN public.properties p ON p.id=un.property_id
   WHERE a.user_id=u.id AND a.role='resident' AND a.end_date IS NULL
   AND (un.id IN (SELECT s.unit_id FROM private.vendor_scope_unit_ids(auth.uid()) s)
        OR p.created_by=auth.uid() OR (p.owner_type='vendor' AND p.landlord_id=auth.uid()))
 ));
$function$;