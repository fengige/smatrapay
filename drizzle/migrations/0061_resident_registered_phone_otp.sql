CREATE OR REPLACE FUNCTION public.normalize_resident_phone(p_phone text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT CASE WHEN n ~ '^0[17][0-9]{8}$' THEN '+254'||substr(n,2) WHEN n ~ '^[17][0-9]{8}$' THEN '+254'||n WHEN n ~ '^254[17][0-9]{8}$' THEN '+'||n WHEN n ~ '^[1-9][0-9]{8,14}$' AND n NOT LIKE '254%' THEN '+'||n ELSE NULL END FROM (SELECT regexp_replace(regexp_replace(btrim(p_phone),'[[:space:]()-]','','g'),'^(\+|00)','','g') n) s $$;
CREATE TABLE public.resident_phone_challenges (id uuid PRIMARY KEY, resident_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, phone text NOT NULL, code_hash text NOT NULL CHECK(length(code_hash)=64), expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0, delivered boolean NOT NULL DEFAULT false, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.resident_phone_challenges TO service_role;
REVOKE ALL ON public.resident_phone_challenges FROM anon,authenticated;
ALTER TABLE public.resident_phone_challenges ENABLE ROW LEVEL SECURITY;
CREATE INDEX resident_phone_challenges_phone_idx ON public.resident_phone_challenges(phone,created_at);
CREATE OR REPLACE FUNCTION public.find_resident_phone_account(p_phone text) RETURNS TABLE(id uuid,phone text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT u.id,public.normalize_resident_phone(u.phone) FROM public.users u WHERE public.normalize_resident_phone(u.phone)=p_phone AND u.status='active' AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=u.id AND r.role='resident') AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=u.id AND r.role NOT IN('resident','user')) AND (SELECT count(*) FROM public.users d WHERE public.normalize_resident_phone(d.phone)=p_phone AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=d.id AND r.role='resident'))=1 $$;
REVOKE ALL ON FUNCTION public.find_resident_phone_account(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.find_resident_phone_account(text) TO service_role;
CREATE OR REPLACE FUNCTION public.create_resident_phone_challenge(p_id uuid,p_resident uuid,p_phone text,p_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended(p_phone,0));
IF NOT EXISTS(SELECT 1 FROM public.find_resident_phone_account(p_phone) a WHERE a.id=p_resident) THEN RAISE EXCEPTION 'Account unavailable'; END IF;
UPDATE public.resident_phone_challenges SET consumed_at=now() WHERE phone=p_phone AND consumed_at IS NULL;
DELETE FROM public.resident_phone_challenges WHERE id IN(SELECT id FROM public.resident_phone_challenges WHERE expires_at<now()-interval '1 day' LIMIT 100);
INSERT INTO public.resident_phone_challenges(id,resident_id,phone,code_hash,expires_at) VALUES(p_id,p_resident,p_phone,p_hash,now()+interval '5 minutes'); END $$;
REVOKE ALL ON FUNCTION public.create_resident_phone_challenge(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_resident_phone_challenge(uuid,uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.consume_resident_phone_challenge(p_id uuid,p_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE c public.resident_phone_challenges; BEGIN
SELECT * INTO c FROM public.resident_phone_challenges WHERE id=p_id FOR UPDATE;
IF NOT FOUND OR c.consumed_at IS NOT NULL OR c.expires_at<=now() OR NOT c.delivered OR c.attempts>=5 THEN RETURN NULL; END IF;
UPDATE public.resident_phone_challenges SET attempts=attempts+1 WHERE id=c.id;
IF c.code_hash<>p_hash THEN RETURN NULL; END IF;
UPDATE public.resident_phone_challenges SET consumed_at=now() WHERE id=c.id;
IF NOT EXISTS(SELECT 1 FROM public.find_resident_phone_account(c.phone) a WHERE a.id=c.resident_id) THEN RETURN NULL; END IF;
RETURN c.resident_id; END $$;
REVOKE ALL ON FUNCTION public.consume_resident_phone_challenge(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_resident_phone_challenge(uuid,text) TO service_role;