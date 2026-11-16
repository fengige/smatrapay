CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT private.has_role(_user_id,_role) AND (_role <> 'resident' OR private.resident_google_session_allowed());
$$;
CREATE OR REPLACE FUNCTION public.resident_evidence_unattached(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT private.resident_google_session_allowed() AND p_path LIKE auth.uid()::text || '/resident-requests/%' AND NOT EXISTS(SELECT 1 FROM public.service_request_events WHERE storage_path=p_path);
$$;