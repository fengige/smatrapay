CREATE OR REPLACE FUNCTION private.log_meter_commission_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb := '{}'::jsonb;
BEGIN
  IF NEW.commission_percentage IS DISTINCT FROM OLD.commission_percentage THEN
    v := v || jsonb_build_object('commission_percentage', jsonb_build_object('old', OLD.commission_percentage, 'new', NEW.commission_percentage));
  END IF;
  IF NEW.vat_on_commission_percentage IS DISTINCT FROM OLD.vat_on_commission_percentage THEN
    v := v || jsonb_build_object('vat_on_commission_percentage', jsonb_build_object('old', OLD.vat_on_commission_percentage, 'new', NEW.vat_on_commission_percentage));
  END IF;
  IF v <> '{}'::jsonb THEN
    INSERT INTO public.meter_audit_logs (meter_id, actor_id, action, changes) VALUES (NEW.id, auth.uid(), 'update', v);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION private.log_meter_commission_changes() FROM PUBLIC;
CREATE TRIGGER meters_log_commission_changes AFTER UPDATE OF commission_percentage, vat_on_commission_percentage ON public.meters
FOR EACH ROW EXECUTE FUNCTION private.log_meter_commission_changes();