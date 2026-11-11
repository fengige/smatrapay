CREATE FUNCTION public.vendor_price_commissions()
RETURNS TABLE(meter_id uuid, commission_payer text, commission_percentage numeric, vat_on_commission_percentage numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT m.id,
 CASE WHEN specific.owner_id IS NOT NULL THEN specific.commission_payer ELSE general.commission_payer END,
 CASE WHEN specific.owner_id IS NOT NULL THEN specific.commission_percentage ELSE general.commission_percentage END,
 CASE WHEN specific.owner_id IS NOT NULL THEN specific.vat_on_commission_percentage ELSE general.vat_on_commission_percentage END
 FROM public.meters m
 LEFT JOIN public.units u ON u.id = m.unit_id
 LEFT JOIN public.owner_commission_settings general
 ON general.owner_id::text = coalesce(m.landlord_id::text, m.agent_id::text, m.vendor_id::text)
 LEFT JOIN public.owner_property_commission_settings specific
 ON specific.owner_id::text = coalesce(m.landlord_id::text, m.agent_id::text, m.vendor_id::text)
 AND specific.property_id = u.property_id
 WHERE m.vendor_id::text = auth.uid()::text AND public.has_role(auth.uid(), 'vendor')
$$;
REVOKE ALL ON FUNCTION public.vendor_price_commissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_price_commissions() TO authenticated;
COMMENT ON FUNCTION public.vendor_price_commissions() IS 'Read-only effective commission for session-owned vendor meters only; actual meter owner, property override before all-properties. Does not expose other properties, history or configuration writes.';