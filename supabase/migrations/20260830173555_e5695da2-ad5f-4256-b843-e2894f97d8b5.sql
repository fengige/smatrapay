ALTER TABLE public.zones ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active';
ALTER TABLE public.zones DROP CONSTRAINT IF EXISTS zones_status_check;
ALTER TABLE public.zones ADD CONSTRAINT zones_status_check CHECK (status IN ('Active','Inactive'));

-- Record status changes in the zone audit log
CREATE OR REPLACE FUNCTION private.log_zone_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.zone_audit_logs (zone_id, zone_name, actor_id, action, changes)
    VALUES (NEW.zone_id, NEW.zone_name, auth.uid(), 'created',
      jsonb_build_object('zone_name', jsonb_build_object('old', null, 'new', NEW.zone_name)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.zone_name IS DISTINCT FROM OLD.zone_name THEN
      v_changes := v_changes || jsonb_build_object('zone_name', jsonb_build_object('old', OLD.zone_name, 'new', NEW.zone_name));
    END IF;
    IF NEW.description IS DISTINCT FROM OLD.description THEN
      v_changes := v_changes || jsonb_build_object('description', jsonb_build_object('old', OLD.description, 'new', NEW.description));
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', NEW.status));
    END IF;
    IF v_changes <> '{}'::jsonb THEN
      INSERT INTO public.zone_audit_logs (zone_id, zone_name, actor_id, action, changes)
      VALUES (NEW.zone_id, NEW.zone_name, auth.uid(), 'updated', v_changes);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.zone_audit_logs (zone_id, zone_name, actor_id, action, changes)
    VALUES (OLD.zone_id, OLD.zone_name, auth.uid(), 'deleted',
      jsonb_build_object('zone_name', jsonb_build_object('old', OLD.zone_name, 'new', null)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$