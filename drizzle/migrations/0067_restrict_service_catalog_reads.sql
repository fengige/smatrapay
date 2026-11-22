DROP POLICY IF EXISTS "Signed-in users read catalog" ON public.service_catalog;
CREATE POLICY "Staff read catalog" ON public.service_catalog FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
  OR public.has_role(auth.uid(), 'vendor'::public.app_role)
  OR public.has_role(auth.uid(), 'agent'::public.app_role)
  OR public.has_role(auth.uid(), 'landlord'::public.app_role)
  OR public.has_role(auth.uid(), 'service_provider'::public.app_role)
);