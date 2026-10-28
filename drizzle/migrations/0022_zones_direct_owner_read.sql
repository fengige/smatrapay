ALTER POLICY "Vendors can view their zones" ON public.zones
USING (
  public.has_role(auth.uid(), 'vendor'::public.app_role)
  AND (
    vendor_id = auth.uid()
    OR private.vendor_can_access_zone(auth.uid(), zone_id)
  )
);
COMMENT ON POLICY "Vendors can view their zones" ON public.zones IS 'Direct row ownership must be checked before the STABLE relationship helper so INSERT RETURNING can read a newly created vendor zone in the same statement. Existing property-linked access is preserved.';