CREATE OR REPLACE FUNCTION public.guard_resident_self_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() = OLD.id AND public.has_role(auth.uid(),'resident') AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role NOT IN ('resident','user')) THEN
  IF (to_jsonb(NEW) - ARRAY['name','username','phone','address','id_number','bio','profile_image','updated_at','updated_by']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['name','username','phone','address','id_number','bio','profile_image','updated_at','updated_by']) THEN RAISE EXCEPTION 'Protected account fields cannot be changed'; END IF;
  IF NEW.profile_image IS DISTINCT FROM OLD.profile_image AND NEW.profile_image IS NOT NULL THEN
   IF NEW.profile_image !~ ('^' || OLD.id::text || '/profile/[0-9a-f-]{36}\.(jpg|png|webp)$') OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='avatars' AND name=NEW.profile_image AND (metadata->>'size')::bigint BETWEEN 1 AND 5242880 AND metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp')) THEN RAISE EXCEPTION 'Invalid profile photo'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END; $$;
ALTER POLICY "Resident avatar uploads require validated server flow" ON storage.objects WITH CHECK(bucket_id <> 'avatars' OR NOT public.has_role(auth.uid(),'resident') OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role NOT IN ('resident','user')));
ALTER POLICY "Resident avatar replacements require validated server flow" ON storage.objects USING(bucket_id <> 'avatars' OR NOT public.has_role(auth.uid(),'resident') OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role NOT IN ('resident','user'))) WITH CHECK(bucket_id <> 'avatars' OR NOT public.has_role(auth.uid(),'resident') OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role NOT IN ('resident','user')));
