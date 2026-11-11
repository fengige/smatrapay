CREATE POLICY "Landlords request price changes on linked meters" ON public.meter_price_change_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() AND status = 'pending' AND public.has_role(auth.uid(),'landlord')
    AND meter_id IN (SELECT public.landlord_meter_ids())
    AND EXISTS (SELECT 1 FROM public.meters m WHERE m.id = meter_id AND m.vendor_id = vendor_id::text));
CREATE POLICY "Landlords view their own price change requests" ON public.meter_price_change_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() AND public.has_role(auth.uid(),'landlord'));
CREATE POLICY "Landlords supersede their own pending requests" ON public.meter_price_change_requests FOR UPDATE TO authenticated
  USING (requested_by = auth.uid() AND status = 'pending' AND public.has_role(auth.uid(),'landlord'))
  WITH CHECK (requested_by = auth.uid() AND status = 'rejected');