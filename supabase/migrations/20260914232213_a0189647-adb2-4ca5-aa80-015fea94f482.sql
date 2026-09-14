CREATE POLICY "Vendors view sms logs for their meters"
ON public.token_sms_logs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.meter_tokens t
  WHERE t.id = token_sms_logs.token_id
    AND t.meter_id IN (SELECT s.meter_id FROM private.vendor_meter_ids(auth.uid()) s(meter_id))
));

CREATE POLICY "Vendors insert sms logs for their meters"
ON public.token_sms_logs FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'vendor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.meter_tokens t
    WHERE t.id = token_sms_logs.token_id
      AND t.meter_id IN (SELECT s.meter_id FROM private.vendor_meter_ids(auth.uid()) s(meter_id))
  )
);

CREATE POLICY "Vendors update sms fields on their tokens"
ON public.meter_tokens FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'vendor'::app_role)
  AND meter_id IN (SELECT s.meter_id FROM private.vendor_meter_ids(auth.uid()) s(meter_id))
)
WITH CHECK (
  has_role(auth.uid(), 'vendor'::app_role)
  AND meter_id IN (SELECT s.meter_id FROM private.vendor_meter_ids(auth.uid()) s(meter_id))
);

CREATE OR REPLACE FUNCTION public.guard_meter_token_vendor_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.meter_id IS DISTINCT FROM OLD.meter_id
     OR NEW.token IS DISTINCT FROM OLD.token
     OR NEW.action IS DISTINCT FROM OLD.action
     OR NEW.units IS DISTINCT FROM OLD.units
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.issued_by IS DISTINCT FROM OLD.issued_by THEN
    RAISE EXCEPTION 'Only the receipt phone number can be changed on an issued token';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_meter_token_vendor_update ON public.meter_tokens;
CREATE TRIGGER guard_meter_token_vendor_update
BEFORE UPDATE ON public.meter_tokens
FOR EACH ROW EXECUTE FUNCTION public.guard_meter_token_vendor_update();