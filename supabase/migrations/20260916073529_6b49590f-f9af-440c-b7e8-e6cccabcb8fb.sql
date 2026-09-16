CREATE OR REPLACE FUNCTION private.vendor_zone_ids(_vendor uuid)
 RETURNS TABLE(zone_id integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT p.zone_id FROM public.properties p
  WHERE p.zone_id IS NOT NULL
    AND p.id IN (SELECT property_id FROM private.vendor_property_ids(_vendor))
  UNION
  SELECT z.zone_id FROM public.zones z WHERE z.vendor_id = _vendor
$function$;