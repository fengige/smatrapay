CREATE POLICY "Admins manage property photo files"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'property-photos' AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'property-photos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Vendors manage scoped property photo files"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'property-photos'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT s.property_id FROM private.vendor_scope_property_ids(auth.uid()) s(property_id)
  )
)
WITH CHECK (
  bucket_id = 'property-photos'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT s.property_id FROM private.vendor_scope_property_ids(auth.uid()) s(property_id)
  )
);

CREATE POLICY "Owners view their property photo files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'property-photos'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT p.id FROM public.properties p WHERE p.landlord_id = auth.uid()
  )
);