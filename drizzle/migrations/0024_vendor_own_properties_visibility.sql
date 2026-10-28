CREATE POLICY "Vendors can view properties they own or created"
ON public.properties FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'vendor'::public.app_role)
  AND (
    created_by = auth.uid()
    OR (owner_type = 'vendor' AND landlord_id = auth.uid())
  )
);
COMMENT ON POLICY "Vendors can view properties they own or created" ON public.properties IS 'Allow direct vendor ownership or authenticated vendor creation before units and meters exist. Existing relationship-scoped read policy is preserved.';