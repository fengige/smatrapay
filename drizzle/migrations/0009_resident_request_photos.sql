CREATE POLICY "Residents upload maintenance evidence" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'meter-evidence' AND public.has_role(auth.uid(), 'resident') AND (storage.foldername(name))[1] = auth.uid()::text AND (storage.foldername(name))[2] = 'resident-requests' AND lower(storage.extension(name)) IN ('jpg','png','webp'));
CREATE POLICY "Residents remove unattached maintenance evidence" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'meter-evidence' AND public.has_role(auth.uid(), 'resident') AND (storage.foldername(name))[1] = auth.uid()::text AND (storage.foldername(name))[2] = 'resident-requests' AND NOT EXISTS (SELECT 1 FROM public.service_request_events e WHERE e.storage_path = name));
CREATE OR REPLACE FUNCTION public.create_resident_service_request(p_resident uuid, p_meter uuid, p_vendor uuid, p_issue text, p_priority public.service_priority, p_description text, p_preferred date, p_photos text[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE result public.service_requests; photo text;
BEGIN
 IF cardinality(p_photos) > 5 THEN RAISE EXCEPTION 'Maximum five photos allowed'; END IF;
 FOREACH photo IN ARRAY p_photos LOOP
  IF photo !~ ('^' || p_resident::text || '/resident-requests/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$') OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'meter-evidence' AND o.name = photo AND (o.metadata->>'size')::bigint BETWEEN 1 AND 5242880 AND o.metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp')) THEN RAISE EXCEPTION 'Invalid or missing photo'; END IF;
 END LOOP;
 INSERT INTO public.service_requests(vendor_id,meter_id,resident_id,issue_type,priority,description,preferred_date,created_by) VALUES(p_vendor,p_meter,p_resident,p_issue,p_priority,p_description,p_preferred,p_resident) RETURNING * INTO result;
 INSERT INTO public.service_request_events(request_id,vendor_id,actor_id,event_type,to_status,note) VALUES(result.id,p_vendor,p_resident,'created','open',p_description);
 FOREACH photo IN ARRAY p_photos LOOP
  INSERT INTO public.service_request_events(request_id,vendor_id,actor_id,event_type,storage_path) VALUES(result.id,p_vendor,p_resident,'resident_photo',photo);
 END LOOP;
 INSERT INTO public.notifications(user_id,type,title,message,resource_type,resource_id) VALUES(p_vendor,'service_request','New resident service request',result.request_number || ': ' || p_issue,'service_request',result.id::text);
 RETURN jsonb_build_object('id',result.id,'request_number',result.request_number);
END; $$;
REVOKE ALL ON FUNCTION public.create_resident_service_request(uuid,uuid,uuid,text,public.service_priority,text,date,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_resident_service_request(uuid,uuid,uuid,text,public.service_priority,text,date,text[]) TO service_role;