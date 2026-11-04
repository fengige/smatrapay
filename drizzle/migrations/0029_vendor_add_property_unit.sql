CREATE POLICY "Vendors can read units of their own properties"
ON public.units FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'vendor'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.properties p WHERE p.id = units.property_id
    AND (p.created_by = auth.uid() OR (p.owner_type = 'vendor' AND p.landlord_id = auth.uid()))
  )
);

CREATE OR REPLACE FUNCTION public.create_vendor_property_unit(p_input jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_property public.properties%ROWTYPE;
  v_id uuid;
  v_number text := btrim(p_input->>'unit_number');
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'vendor'::public.app_role) THEN
    RAISE EXCEPTION 'Vendor access required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_property FROM public.properties
  WHERE id = (p_input->>'property_id')::uuid FOR UPDATE;
  IF NOT FOUND OR NOT (
    coalesce(v_property.created_by = v_actor, false)
    OR coalesce(v_property.owner_type = 'vendor' AND v_property.landlord_id = v_actor, false)
    OR v_property.id IN (SELECT s.property_id FROM private.vendor_scope_property_ids(v_actor) s)
  ) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF v_number IS NULL OR length(v_number) NOT BETWEEN 1 AND 40
    OR length(coalesce(p_input->>'building', '')) > 120
    OR length(coalesce(p_input->>'unit_type', '')) > 60
    OR length(coalesce(p_input->>'floor', '')) > 30
    OR length(coalesce(p_input->>'notes', '')) > 1000
    OR length(coalesce(p_input->>'electricity_meter_no', '')) > 60
    OR length(coalesce(p_input->>'water_meter_no', '')) > 60
    OR length(coalesce(p_input->>'gas_meter_no', '')) > 60
    OR ((p_input->>'bedrooms') IS NOT NULL AND (p_input->>'bedrooms')::integer NOT BETWEEN 0 AND 50)
  THEN
    RAISE EXCEPTION 'Invalid unit details' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.units WHERE property_id = v_property.id AND unit_number = v_number) THEN
    RAISE EXCEPTION 'This unit number already exists in this property' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.units (property_id, unit_number, building, unit_type, bedrooms, floor, status, notes,
    electricity_meter_no, water_meter_no, gas_meter_no, created_by, updated_by)
  VALUES (v_property.id, v_number, nullif(btrim(p_input->>'building'), ''), nullif(btrim(p_input->>'unit_type'), ''),
    (p_input->>'bedrooms')::integer, nullif(btrim(p_input->>'floor'), ''),
    coalesce(p_input->>'status', 'vacant')::public.unit_status, nullif(btrim(p_input->>'notes'), ''),
    nullif(btrim(p_input->>'electricity_meter_no'), ''), nullif(btrim(p_input->>'water_meter_no'), ''),
    nullif(btrim(p_input->>'gas_meter_no'), ''), v_actor, v_actor)
  RETURNING id INTO v_id;
  UPDATE public.properties SET number_of_units = coalesce(number_of_units, 0) + 1, updated_by = v_actor
    WHERE id = v_property.id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_vendor_property_unit(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_vendor_property_unit(jsonb) TO authenticated, service_role;