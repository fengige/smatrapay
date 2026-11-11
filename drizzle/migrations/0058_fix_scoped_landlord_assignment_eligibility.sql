CREATE OR REPLACE FUNCTION public.is_landlord_account(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'vendor'))
    AND EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = p_user AND r.role = 'landlord'
    );
$$;
REVOKE ALL ON FUNCTION public.is_landlord_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_landlord_account(uuid) TO authenticated;
COMMENT ON FUNCTION public.is_landlord_account(uuid) IS 'Admin/vendor-only landlord eligibility check for assignment policies; queries protected target roles without weakening self-only has_role checks. Property management and assigned_by checks remain in RLS.';