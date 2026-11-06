CREATE OR REPLACE FUNCTION public.complete_vendor_resident_import(p_actor uuid,p_resident uuid,p_name text,p_email text,p_unit uuid,p_property uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE u public.units%ROWTYPE; p public.properties%ROWTYPE;
BEGIN
 IF p_actor IS NULL OR NOT public.has_role(p_actor,'vendor') THEN RAISE EXCEPTION 'Vendor access required'; END IF;
 SELECT * INTO p FROM public.properties WHERE id=p_property FOR SHARE;
 IF NOT FOUND OR NOT coalesce((p.created_by=p_actor OR (p.owner_type='vendor' AND p.landlord_id=p_actor) OR EXISTS(SELECT 1 FROM private.vendor_scope_property_ids(p_actor) s WHERE s.property_id=p.id)),false) THEN RAISE EXCEPTION 'Property unavailable in your scope'; END IF;
 SELECT * INTO u FROM public.units WHERE id=p_unit AND property_id=p.id FOR UPDATE;
 IF NOT FOUND OR NOT coalesce((p.created_by=p_actor OR (p.owner_type='vendor' AND p.landlord_id=p_actor) OR EXISTS(SELECT 1 FROM private.vendor_scope_unit_ids(p_actor) s WHERE s.unit_id=u.id)),false) THEN RAISE EXCEPTION 'Unit unavailable in your scope'; END IF;
 IF p.status::text='archived' OR u.status::text IN ('archived','maintenance','occupied') OR EXISTS(SELECT 1 FROM public.unit_assignments WHERE unit_id=u.id AND role='resident' AND (end_date IS NULL OR end_date>=CURRENT_DATE)) THEN RAISE EXCEPTION 'Unit is unavailable or occupied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_resident AND lower(email)=lower(p_email) AND (created_by IS NULL OR created_by=p_actor)) THEN RAISE EXCEPTION 'Account unavailable'; END IF;
 UPDATE public.users SET name=p_name,email=lower(p_email),status='active',created_by=p_actor,updated_by=p_actor WHERE id=p_resident;
 INSERT INTO public.user_roles(user_id,role) VALUES(p_resident,'resident') ON CONFLICT(user_id,role) DO NOTHING;
 INSERT INTO public.unit_assignments(unit_id,user_id,role,start_date,created_by,updated_by) VALUES(u.id,p_resident,'resident',CURRENT_DATE,p_actor,p_actor);
 UPDATE public.units SET status='occupied',updated_by=p_actor WHERE id=u.id;
 INSERT INTO public.user_audit_logs(user_id,actor_id,action,changes) VALUES(p_resident,p_actor,'resident_created',jsonb_build_object('detail','Resident created through vendor CSV import','unit_id',u.id,'property_id',p.id));
END $$;
REVOKE ALL ON FUNCTION public.complete_vendor_resident_import(uuid,uuid,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_vendor_resident_import(uuid,uuid,text,text,uuid,uuid) TO service_role;