CREATE OR REPLACE FUNCTION public.import_meter_unit_assignment(p_portal text, p_meter uuid, p_unit uuid, p_property uuid, p_resident uuid, p_type text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
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
 IF p_resident IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_resident AND status::text='active') OR NOT public.has_role(p_resident,'resident') THEN RAISE EXCEPTION 'Resident is not active'; END IF;
   SELECT * INTO a FROM public.unit_assignments WHERE user_id=p_resident AND unit_id=u.id AND role='resident' AND start_date<=CURRENT_DATE AND (end_date IS NULL OR end_date>=CURRENT_DATE) LIMIT 1 FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Resident is not currently assigned to this unit'; END IF;
 END IF;
 legacy:=CASE lower(p_type) WHEN 'electricity' THEN u.electricity_meter_no WHEN 'water' THEN u.water_meter_no WHEN 'gas' THEN u.gas_meter_no END;
 IF nullif(trim(legacy),'') IS NOT NULL AND lower(trim(legacy))<>lower(m.meter_number) THEN RAISE EXCEPTION 'Unit has a different meter number recorded for this type'; END IF;
 IF m.unit_id=u.id THEN RETURN jsonb_build_object('status','skipped','reason','Already assigned to this unit'); END IF;
 IF m.unit_id IS NOT NULL THEN RAISE EXCEPTION 'Meter already assigned elsewhere; use Change assignment'; END IF;
 IF EXISTS(SELECT 1 FROM public.meters WHERE unit_id=u.id AND lower(type::text)=lower(p_type) AND id<>m.id) THEN RAISE EXCEPTION 'Unit already has a meter of this type'; END IF;
 UPDATE public.meters SET unit_id=u.id WHERE id=m.id;
 UPDATE public.units SET electricity_meter_no=CASE WHEN lower(p_type)='electricity' THEN m.meter_number ELSE electricity_meter_no END, water_meter_no=CASE WHEN lower(p_type)='water' THEN m.meter_number ELSE water_meter_no END, gas_meter_no=CASE WHEN lower(p_type)='gas' THEN m.meter_number ELSE gas_meter_no END, updated_by=actor WHERE id=u.id;
 RETURN jsonb_build_object('status','successful','reason','Assigned');
END $function$;