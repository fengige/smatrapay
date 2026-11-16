CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.raw_app_meta_data->>'provider' = 'google' THEN RETURN NEW; END IF;
  INSERT INTO public.users (id,name,email,email_verified_at,username,phone,profile_image,created_by,updated_by)
  VALUES (NEW.id,NULLIF(NEW.raw_user_meta_data->>'name',''),NEW.email,NEW.email_confirmed_at,NULLIF(NEW.raw_user_meta_data->>'username',''),COALESCE(NULLIF(NEW.raw_user_meta_data->>'phone',''),NEW.phone),NULLIF(NEW.raw_user_meta_data->>'avatar_url',''),NEW.id,NEW.id)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles(user_id,role) VALUES(NEW.id,'resident') ON CONFLICT(user_id,role) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.resident_google_access()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_email text; v_count integer; v_id uuid; v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 'unverified'; END IF;
  SELECT lower(btrim(i.identity_data->>'email')) INTO v_email
  FROM auth.identities i JOIN auth.users a ON a.id=i.user_id
  WHERE i.user_id=auth.uid() AND i.provider='google'
    AND i.identity_data->>'email_verified'='true' AND a.email_confirmed_at IS NOT NULL
    AND lower(btrim(a.email))=lower(btrim(i.identity_data->>'email'));
  IF v_email IS NULL OR v_email='' THEN RETURN 'unverified'; END IF;
  SELECT count(*) INTO v_count FROM public.users u
    WHERE lower(btrim(u.email))=v_email AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=u.id AND r.role='resident');
  IF v_count=0 THEN RETURN 'unregistered'; END IF;
  IF v_count<>1 THEN RETURN 'duplicate'; END IF;
  SELECT u.id,u.status::text INTO v_id,v_status FROM public.users u
    WHERE lower(btrim(u.email))=v_email AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=u.id AND r.role='resident');
  IF v_id IS DISTINCT FROM auth.uid() THEN RETURN 'link_required'; END IF;
  IF v_status<>'active' THEN RETURN 'inactive'; END IF;
  RETURN 'allowed';
END $$;
REVOKE ALL ON FUNCTION public.resident_google_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resident_google_access() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.resident_google_session_allowed()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN true; END IF;
  IF EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.role NOT IN ('resident','user')) THEN RETURN true; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(auth.jwt()->'amr','[]'::jsonb)) a WHERE a->>'method'='oauth') THEN RETURN true; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=auth.uid() AND i.provider='google') THEN RETURN true; END IF;
  RETURN public.resident_google_access()='allowed';
END $$;
REVOKE ALL ON FUNCTION private.resident_google_session_allowed() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.resident_google_session_allowed() TO authenticated,service_role;

DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity LOOP
    EXECUTE format('CREATE POLICY resident_google_registered_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.resident_google_session_allowed())) WITH CHECK ((SELECT private.resident_google_session_allowed()))',t.relname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Allow user insert" ON public.user_roles;
CREATE POLICY "Allow resident self role insert" ON public.user_roles FOR INSERT TO authenticated
WITH CHECK(user_id=auth.uid() AND role IN ('resident','user') AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid()));