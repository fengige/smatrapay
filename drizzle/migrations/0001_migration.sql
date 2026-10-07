DROP POLICY IF EXISTS "Authenticated write vending integration logs" ON public.vending_integration_logs;

DROP POLICY IF EXISTS "Authenticated write vending software history" ON public.vending_software_audit_logs;
CREATE POLICY "Admins write vending software history" ON public.vending_software_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can view vending software" ON public.vending_software;
CREATE POLICY "Staff and owners can view vending software" ON public.vending_software
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vendor')
      OR public.has_role(auth.uid(), 'agent') OR public.has_role(auth.uid(), 'landlord'));