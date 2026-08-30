-- Update the meter change logger to handle INSERT as well as UPDATE events.
CREATE OR REPLACE FUNCTION private.log_meter_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    -- Record the initial values of the fields we track.
    v_changes := jsonb_build_object(
      'initial_reading', jsonb_build_object('old', null, 'new', NEW.initial_reading),
      'price_per_unit',  jsonb_build_object('old', null, 'new', NEW.price_per_unit),
      'type',            jsonb_build_object('old', null, 'new', NEW.type),
      'status',          jsonb_build_object('old', null, 'new', NEW.status),
      'unit_id',         jsonb_build_object('old', null, 'new', NEW.unit_id),
      'landlord_id',     jsonb_build_object('old', null, 'new', NEW.landlord_id),
      'agent_id',        jsonb_build_object('old', null, 'new', NEW.agent_id),
      'supplier_id',     jsonb_build_object('old', null, 'new', NEW.supplier_id)
    );
  ELSE
    v_action := 'update';
    IF NEW.initial_reading IS DISTINCT FROM OLD.initial_reading THEN
      v_changes := v_changes || jsonb_build_object('initial_reading', jsonb_build_object('old', OLD.initial_reading, 'new', NEW.initial_reading));
    END IF;
    IF NEW.price_per_unit IS DISTINCT FROM OLD.price_per_unit THEN
      v_changes := v_changes || jsonb_build_object('price_per_unit', jsonb_build_object('old', OLD.price_per_unit, 'new', NEW.price_per_unit));
    END IF;
    IF NEW.type IS DISTINCT FROM OLD.type THEN
      v_changes := v_changes || jsonb_build_object('type', jsonb_build_object('old', OLD.type, 'new', NEW.type));
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', NEW.status));
    END IF;
    IF NEW.unit_id IS DISTINCT FROM OLD.unit_id THEN
      v_changes := v_changes || jsonb_build_object('unit_id', jsonb_build_object('old', OLD.unit_id, 'new', NEW.unit_id));
    END IF;
    IF NEW.landlord_id IS DISTINCT FROM OLD.landlord_id THEN
      v_changes := v_changes || jsonb_build_object('landlord_id', jsonb_build_object('old', OLD.landlord_id, 'new', NEW.landlord_id));
    END IF;
    IF NEW.agent_id IS DISTINCT FROM OLD.agent_id THEN
      v_changes := v_changes || jsonb_build_object('agent_id', jsonb_build_object('old', OLD.agent_id, 'new', NEW.agent_id));
    END IF;
    IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
      v_changes := v_changes || jsonb_build_object('supplier_id', jsonb_build_object('old', OLD.supplier_id, 'new', NEW.supplier_id));
    END IF;
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.meter_audit_logs (meter_id, actor_id, action, changes)
    VALUES (NEW.id, auth.uid(), v_action, v_changes);
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure the existing UPDATE trigger is still in place, then add an INSERT trigger.
DROP TRIGGER IF EXISTS meters_log_changes ON public.meters;
CREATE TRIGGER meters_log_changes
  AFTER UPDATE ON public.meters
  FOR EACH ROW
  EXECUTE FUNCTION private.log_meter_changes();

CREATE TRIGGER meters_log_changes_insert
  AFTER INSERT ON public.meters
  FOR EACH ROW
  EXECUTE FUNCTION private.log_meter_changes();
