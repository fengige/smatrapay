CREATE POLICY "Vendors read own meter bank notifications" ON public.bank_notifications
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'vendor'::app_role)
  AND meter_number IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.meters m WHERE m.meter_number = bank_notifications.meter_number AND m.vendor_id = (auth.uid())::text)
);