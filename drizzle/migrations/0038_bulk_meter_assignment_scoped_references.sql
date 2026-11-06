CREATE OR REPLACE FUNCTION public.meter_assignment_csv_references(p_portal text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private AS $$
DECLARE actor uuid:=auth.uid(); props uuid[]; unit_ids uuid[]; result jsonb;
BEGIN
 IF actor IS NULL OR p_portal NOT IN ('admin','vendor') OR NOT public.has_role(actor,p_portal::public.app_role) THEN RAISE EXCEPTION 'Access denied'; END IF;
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