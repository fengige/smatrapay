
CREATE POLICY "Vendors upload meter evidence" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'meter-evidence' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_role(auth.uid(),'vendor'));
CREATE POLICY "Vendors read their meter evidence" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'meter-evidence' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'admin')));
