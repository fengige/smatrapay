CREATE TABLE public.property_landlords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  landlord_id uuid NOT NULL,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, landlord_id)
);
CREATE INDEX property_landlords_landlord_idx ON public.property_landlords(landlord_id);
GRANT SELECT, INSERT, DELETE ON public.property_landlords TO authenticated;
GRANT ALL ON public.property_landlords TO service_role;
ALTER TABLE public.property_landlords ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_property_landlords(p_property uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'vendor') AND EXISTS(
    SELECT 1 FROM properties p WHERE p.id=p_property AND (p.created_by=auth.uid() OR (p.owner_type='vendor' AND p.landlord_id=auth.uid()))))
$$;
REVOKE ALL ON FUNCTION public.can_manage_property_landlords(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_property_landlords(uuid) TO authenticated;

CREATE POLICY property_landlords_read ON public.property_landlords FOR SELECT TO authenticated
  USING (landlord_id = auth.uid() OR public.can_manage_property_landlords(property_id));
CREATE POLICY property_landlords_insert ON public.property_landlords FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_property_landlords(property_id) AND assigned_by = auth.uid() AND public.has_role(landlord_id,'landlord'));
CREATE POLICY property_landlords_delete ON public.property_landlords FOR DELETE TO authenticated
  USING (public.can_manage_property_landlords(property_id));

INSERT INTO public.property_landlords(property_id, landlord_id)
SELECT p.id, p.landlord_id FROM public.properties p
WHERE p.landlord_id IS NOT NULL AND coalesce(p.owner_type,'landlord')='landlord' AND public.has_role(p.landlord_id,'landlord')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.landlord_unit_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT u.id FROM units u WHERE has_role(auth.uid(),'landlord') AND (EXISTS(SELECT 1 FROM properties p WHERE p.id=u.property_id AND p.landlord_id=auth.uid() AND coalesce(p.owner_type,'landlord')='landlord') OR EXISTS(SELECT 1 FROM property_landlords pl WHERE pl.property_id=u.property_id AND pl.landlord_id=auth.uid()) OR EXISTS(SELECT 1 FROM unit_assignments a WHERE a.unit_id=u.id AND a.user_id=auth.uid() AND a.role='landlord' AND a.start_date<=current_date AND (a.end_date IS NULL OR a.end_date>=current_date)) OR EXISTS(SELECT 1 FROM meters m WHERE m.landlord_id=auth.uid() AND (m.unit_id=u.id OR (m.unit_id IS NULL AND m.meter_number IN(u.electricity_meter_no,u.water_meter_no,u.gas_meter_no))))) $$;
CREATE OR REPLACE FUNCTION public.landlord_property_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT p.id FROM properties p WHERE has_role(auth.uid(),'landlord') AND ((p.landlord_id=auth.uid() AND coalesce(p.owner_type,'landlord')='landlord') OR EXISTS(SELECT 1 FROM property_landlords pl WHERE pl.property_id=p.id AND pl.landlord_id=auth.uid()) OR EXISTS(SELECT 1 FROM units u WHERE u.property_id=p.id AND u.id IN(SELECT public.landlord_unit_ids()))) $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.property_landlords;