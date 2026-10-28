CREATE OR REPLACE FUNCTION private.vendor_created_landlord_ids(_vendor uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, private
AS $function$
  SELECT u.id
  FROM public.users u
  JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'landlord'::public.app_role
  WHERE u.created_by = _vendor
    AND _vendor = auth.uid()
    AND private.has_role(auth.uid(), 'vendor'::public.app_role)
$function$;
REVOKE ALL ON FUNCTION private.vendor_created_landlord_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.vendor_created_landlord_ids(uuid) TO authenticated;
CREATE POLICY "Vendors can view landlords they created"
ON public.users FOR SELECT TO authenticated
USING (id IN (SELECT s.user_id FROM private.vendor_created_landlord_ids(auth.uid()) s));