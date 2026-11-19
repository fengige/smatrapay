CREATE TABLE public.vendor_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference text NOT NULL UNIQUE DEFAULT ('SVA-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))), submission_key uuid NOT NULL UNIQUE,
 business_name text NOT NULL CHECK(length(business_name) BETWEEN 2 AND 120), business_type text NOT NULL CHECK(business_type IN ('Company','Sole proprietor','Partnership','Other')), registration_number text NOT NULL DEFAULT '' CHECK(length(registration_number)<=100),
 contact_name text NOT NULL CHECK(length(contact_name) BETWEEN 2 AND 120), email text NOT NULL CHECK(length(email)<=254 AND email=lower(btrim(email))), phone text NOT NULL CHECK(phone ~ '^\+254[17][0-9]{8}$'), location text NOT NULL CHECK(length(location) BETWEEN 3 AND 500), services text[] NOT NULL CHECK(cardinality(services) BETWEEN 1 AND 3 AND services <@ ARRAY['Electricity','Water','Gas']::text[]), description text NOT NULL DEFAULT '' CHECK(length(description)<=1000), contact_preference text NOT NULL CHECK(contact_preference IN ('Email','Phone')), consent boolean NOT NULL CHECK(consent=true),
 status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Accepted','Rejected')), submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_by uuid, reviewed_at timestamptz, rejection_reason text CHECK(length(rejection_reason)<=1000), vendor_user_id uuid UNIQUE,
 processing_at timestamptz, processing_by uuid, email_status text NOT NULL DEFAULT 'not_sent' CHECK(email_status IN ('not_sent','sending','sent','failed','suppressed','uncertain')), sms_status text NOT NULL DEFAULT 'not_sent' CHECK(sms_status IN ('not_sent','sending','sent','failed','uncertain')), email_attempt integer NOT NULL DEFAULT 0, sms_attempt integer NOT NULL DEFAULT 0, email_attempted_at timestamptz, sms_attempted_at timestamptz,
 CHECK ((status='Pending' AND reviewed_at IS NULL) OR (status='Accepted' AND vendor_user_id IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL) OR (status='Rejected' AND vendor_user_id IS NULL AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND length(btrim(rejection_reason))>=3))
);
GRANT SELECT ON public.vendor_applications TO authenticated;
GRANT ALL ON public.vendor_applications TO service_role;
ALTER TABLE public.vendor_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_read ON public.vendor_applications FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE UNIQUE INDEX vendor_applications_open_email ON public.vendor_applications(email) WHERE status<>'Rejected';
CREATE UNIQUE INDEX vendor_applications_open_phone ON public.vendor_applications(phone) WHERE status<>'Rejected';
CREATE INDEX vendor_applications_recent ON public.vendor_applications(status,submitted_at DESC,id);
CREATE TABLE public.vendor_application_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES public.vendor_applications(id), actor_id uuid, event_type text NOT NULL, detail text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.vendor_application_events TO authenticated;
GRANT ALL ON public.vendor_application_events TO service_role;
ALTER TABLE public.vendor_application_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_read ON public.vendor_application_events FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE TABLE public.vendor_application_limits(key text PRIMARY KEY,started_at timestamptz NOT NULL DEFAULT now(),attempts integer NOT NULL DEFAULT 0);
GRANT ALL ON public.vendor_application_limits TO service_role;
ALTER TABLE public.vendor_application_limits ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.consume_vendor_application_limit(p_key text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE n integer; BEGIN INSERT INTO public.vendor_application_limits(key,attempts) VALUES(p_key,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN vendor_application_limits.started_at<now()-interval '1 hour' THEN 1 ELSE vendor_application_limits.attempts+1 END,started_at=CASE WHEN vendor_application_limits.started_at<now()-interval '1 hour' THEN now() ELSE vendor_application_limits.started_at END RETURNING attempts INTO n; RETURN n<=5; END $$;
REVOKE ALL ON FUNCTION public.consume_vendor_application_limit(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_vendor_application_limit(text) TO service_role;
CREATE FUNCTION public.claim_vendor_application_review(p_id uuid,p_actor uuid,p_decision text,p_reason text DEFAULT '') RETURNS public.vendor_applications LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE a public.vendor_applications; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 SELECT * INTO a FROM public.vendor_applications WHERE id=p_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
 IF a.status<>'Pending' THEN RAISE EXCEPTION 'Application already reviewed'; END IF;
 IF p_decision='Rejected' THEN
 IF a.vendor_user_id IS NOT NULL THEN RAISE EXCEPTION 'Account provisioning has started; finish acceptance instead'; END IF;
 IF length(btrim(p_reason))<3 OR length(p_reason)>1000 THEN RAISE EXCEPTION 'Rejection reason required'; END IF;
 UPDATE public.vendor_applications SET status='Rejected',reviewed_at=now(),reviewed_by=p_actor,rejection_reason=btrim(p_reason) WHERE id=p_id RETURNING * INTO a;
 INSERT INTO public.vendor_application_events(application_id,actor_id,event_type,detail) VALUES(p_id,p_actor,'Rejected',btrim(p_reason)); RETURN a;
 ELSIF p_decision<>'Accepted' THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 IF a.processing_at>now()-interval '5 minutes' THEN RAISE EXCEPTION 'Acceptance is in progress; wait before retrying'; END IF;
 IF EXISTS(SELECT 1 FROM public.users u WHERE u.id IS DISTINCT FROM a.vendor_user_id AND (lower(btrim(u.email))=a.email OR public.normalize_resident_phone(u.phone)=a.phone)) OR EXISTS(SELECT 1 FROM auth.users u WHERE u.id IS DISTINCT FROM a.vendor_user_id AND (lower(u.email)=a.email OR public.normalize_resident_phone(u.phone)=a.phone)) THEN RAISE EXCEPTION 'Email or phone conflicts with an existing account; resolve the account conflict before acceptance'; END IF;
 UPDATE public.vendor_applications SET vendor_user_id=coalesce(vendor_user_id,gen_random_uuid()),processing_at=now(),processing_by=p_actor WHERE id=p_id RETURNING * INTO a;
 INSERT INTO public.vendor_application_events(application_id,actor_id,event_type) VALUES(p_id,p_actor,'Acceptance started'); RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.claim_vendor_application_review(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_vendor_application_review(uuid,uuid,text,text) TO service_role;
CREATE FUNCTION public.complete_vendor_application(p_id uuid,p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE a public.vendor_applications; BEGIN
 SELECT * INTO a FROM public.vendor_applications WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR a.status<>'Pending' OR a.vendor_user_id IS NULL OR a.processing_by IS DISTINCT FROM p_actor OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin') THEN RAISE EXCEPTION 'Invalid acceptance'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=a.vendor_user_id AND lower(email)=a.email AND raw_app_meta_data->>'vendor_application_id'=p_id::text) THEN RAISE EXCEPTION 'Application account mismatch'; END IF;
 INSERT INTO public.users(id,name,email,phone,bio,status,created_by,updated_by) VALUES(a.vendor_user_id,a.business_name,a.email,a.phone,a.description,'active',p_actor,p_actor) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,phone=excluded.phone,bio=excluded.bio,status='active',created_by=p_actor,updated_by=p_actor;
 DELETE FROM public.user_roles WHERE user_id=a.vendor_user_id;
 INSERT INTO public.user_roles(user_id,role) VALUES(a.vendor_user_id,'vendor');
 UPDATE public.vendor_applications SET status='Accepted',reviewed_by=p_actor,reviewed_at=now(),processing_at=NULL,processing_by=NULL WHERE id=p_id;
 INSERT INTO public.vendor_application_events(application_id,actor_id,event_type) VALUES(p_id,p_actor,'Accepted');
END $$;
REVOKE ALL ON FUNCTION public.complete_vendor_application(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_vendor_application(uuid,uuid) TO service_role;