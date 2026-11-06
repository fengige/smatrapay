CREATE OR REPLACE FUNCTION public.vendor_resident_management_ids()
RETURNS TABLE(user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,private
AS $$ SELECT s.user_id FROM private.vendor_scope_resident_ids(auth.uid()) s
WHERE private.has_role(auth.uid(),'vendor'::public.app_role) $$;
REVOKE ALL ON FUNCTION public.vendor_resident_management_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_resident_management_ids() TO authenticated, service_role;