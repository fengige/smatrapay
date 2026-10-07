DROP POLICY IF EXISTS "Authenticated can create notifications" ON public.notifications;
CREATE POLICY "Staff can create notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'vendor') OR public.has_role(auth.uid(),'agent') OR public.has_role(auth.uid(),'landlord'));

DROP POLICY IF EXISTS "Authenticated can view payment methods" ON public.payment_methods;
CREATE POLICY "Staff can view payment methods" ON public.payment_methods FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'vendor') OR public.has_role(auth.uid(),'agent') OR public.has_role(auth.uid(),'landlord'));

DROP POLICY IF EXISTS "Authenticated can view payment logos" ON storage.objects;
CREATE POLICY "Staff can view payment logos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-logos' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'vendor') OR public.has_role(auth.uid(),'agent') OR public.has_role(auth.uid(),'landlord')));

DROP POLICY IF EXISTS "Anyone can read app settings" ON public.app_settings;
CREATE POLICY "Anyone can read footer settings" ON public.app_settings FOR SELECT TO anon, authenticated
  USING (key IN ('footer_copyright','footer_terms_url','footer_privacy_url'));
CREATE POLICY "Signed-in users can read app settings" ON public.app_settings FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);