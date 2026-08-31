CREATE POLICY "Authenticated can view payment logos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payment-logos');

CREATE POLICY "Admins can upload payment logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payment-logos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update payment logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'payment-logos' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'payment-logos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete payment logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'payment-logos' AND public.has_role(auth.uid(), 'admin'));