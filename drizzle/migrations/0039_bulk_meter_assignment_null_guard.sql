CREATE OR REPLACE FUNCTION public.import_meter_unit_assignment(p_portal text,p_meter uuid,p_unit uuid,p_property uuid,p_resident uuid,p_type text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE m public.meters%ROWTYPE; u public.units%ROWTYPE; p public.properties%ROWTYPE; a public.unit_assignments%ROWTYPE; legacy text; actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR p_portal IS NULL OR p_portal NOT IN ('admin','vendor') OR NOT public.has_role(actor,p_portal::public.app_role) THEN RAISE EXCEPTION 'Access denied'; END IF;
 LOCK TABLE public.meters IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO m FROM public.meters WHERE id=p_meter FOR UPDATE;
 IF NOT FOUND OR (p_portal='vendor' AND m.vendor_id IS DISTINCT FROM actor::text) THEN RAISE EXCEPTION 'Meter unavailable in your scope'; END IF;
 SELECT * INTO p FROM public.properties WHERE id=p_property FOR SHARE;
 IF NOT FOUND OR (p_portal='vendor' AND NOT coalesce((p.created_by=actor OR (p.owner_type='vendor' AND p.landlord_id=actor) OR EXISTS(SELECT 1 FROM private.vendor_scope_property_ids(actor) s WHERE s.property_id=p.id)),false)) THEN RAISE EXCEPTION 'Property unavailable in your scope'; END IF;
 SELECT * INTO u FROM public.units WHERE id=p_unit AND property_id=p.id FOR UPDATE;
 IF NOT FOUND OR (p_portal='vendor' AND NOT coalesce((p.created_by=actor OR (p.owner_type='vendor' AND p.landlord_id=actor) OR EXISTS(SELECT 1 FROM private.vendor_scope_unit_ids(actor) s WHERE s.unit_id=u.id)),false)) THEN RAISE EXCEPTION 'Unit unavailable in your scope'; END IF;
 IF p_type IS NULL OR lower(p_type) NOT IN ('electricity','water','gas') OR lower(m.type::text)<>lower(p_type) THEN RAISE EXCEPTION 'Type does not match the meter'; END IF;
 IF lower(m.status::text)<>'active' OR p.status::text='archived' OR u.status::text IN ('archived','maintenance') THEN RAISE EXCEPTION 'Meter, unit or property is not eligible'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_resident AND status::text='active') OR NOT public.has_role(p_resident,'resident') THEN RAISE EXCEPTION 'Resident is not active'; END IF;
 SELECT * INTO a FROM public.unit_assignments WHERE user_id=p_resident AND unit_id=u.id AND role='resident' AND start_date<=CURRENT_DATE AND (end_date IS NULL OR end_date>=CURRENT_DATE) LIMIT 1 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Resident is not currently assigned to this unit'; END IF;
 legacy:=CASE lower(p_type) WHEN 'electricity' THEN u.electricity_meter_no WHEN 'water' THEN u.water_meter_no WHEN 'gas' THEN u.gas_meter_no END;
 IF nullif(trim(legacy),'') IS NOT NULL AND lower(trim(legacy))<>lower(m.meter_number) THEN RAISE EXCEPTION 'Unit has a different meter number recorded for this type'; END IF;
 IF m.unit_id=u.id THEN RETURN jsonb_build_object('status','skipped','reason','Already assigned to this unit'); END IF;
 IF m.unit_id IS NOT NULL THEN RAISE EXCEPTION 'Meter already assigned elsewhere; use Change assignment'; END IF;
 IF EXISTS(SELECT 1 FROM public.meters WHERE unit_id=u.id AND lower(type::text)=lower(p_type) AND id<>m.id) THEN RAISE EXCEPTION 'Unit already has a meter of this type'; END IF;
 UPDATE public.meters SET unit_id=u.id WHERE id=m.id;
 UPDATE public.units SET electricity_meter_no=CASE WHEN lower(p_type)='electricity' THEN m.meter_number ELSE electricity_meter_no END, water_meter_no=CASE WHEN lower(p_type)='water' THEN m.meter_number ELSE water_meter_no END, gas_meter_no=CASE WHEN lower(p_type)='gas' THEN m.meter_number ELSE gas_meter_no END, updated_by=actor WHERE id=u.id;
 RETURN jsonb_build_object('status','successful','reason','Assigned');
END $$;
REVOKE ALL ON FUNCTION public.import_meter_unit_assignment(text,uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_meter_unit_assignment(text,uuid,uuid,uuid,uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.meter_assignment_csv_references(p_portal text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private AS $$
DECLARE actor uuid:=auth.uid(); props uuid[]; unit_ids uuid[]; result jsonb;
BEGIN
 IF actor IS NULL OR p_portal IS NULL OR p_portal NOT IN ('admin','vendor') OR NOT public.has_role(actor,p_portal::public.app_role) THEN RAISE EXCEPTION 'Access denied'; END IF;
 SELECT coalesce(array_agg(p.id),'{}'::uuid[]) INTO props FROM public.properties p WHERE p_portal='admin' OR p.created_by=actor OR (p.owner_type='vendor' AND p.landlord_id=actor) OR EXISTS(SELECT 1 FROM private.vendor_scope_property_ids(actor) s WHERE s.property_id=p.id);
 SELECT coalesce(array_agg(u.id),'{}'::uuid[]) INTO unit_ids FROM public.units u JOIN public.properties p ON p.id=u.property_id WHERE p.id=ANY(props) AND (p_portal='admin' OR p.created_by=actor OR (p.owner_type='vendor' AND p.landlord_id=actor) OR EXISTS(SELECT 1 FROM private.vendor_scope_unit_ids(actor) s WHERE s.unit_id=u.id));
 SELECT jsonb_build_object(
 'properties',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'status',status)),'[]'::jsonb) FROM public.properties WHERE id=ANY(props)),
 'units',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'number',unit_number,'propertyId',property_id,'status',status,'electricity',electricity_meter_no,'water',water_meter_no,'gas',gas_meter_no)),'[]'::jsonb) FROM public.units WHERE id=ANY(unit_ids)),
 'meters',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'number',meter_number,'type',type,'unitId',unit_id,'status',status)),'[]'::jsonb) FROM public.meters WHERE p_portal='admin' OR vendor_id=actor::text),
 'occupied',(SELECT coalesce(jsonb_agg(jsonb_build_object('unitId',unit_id,'type',type)),'[]'::jsonb) FROM public.meters WHERE unit_id=ANY(unit_ids)),
 'residents',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'email',r.email,'status',r.status,'unitId',a.unit_id)),'[]'::jsonb) FROM public.unit_assignments a JOIN public.users r ON r.id=a.user_id WHERE a.unit_id=ANY(unit_ids) AND a.role='resident' AND a.start_date<=CURRENT_DATE AND (a.end_date IS NULL OR a.end_date>=CURRENT_DATE) AND public.has_role(r.id,'resident'))
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.meter_assignment_csv_references(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.meter_assignment_csv_references(text) TO authenticated;