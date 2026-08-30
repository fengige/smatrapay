CREATE TABLE public.zone_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id integer,
  zone_name text,
  actor_id uuid,
  action text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.zone_audit_logs TO authenticated;
GRANT ALL ON public.zone_audit_logs TO service_role;

ALTER TABLE public.zone_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view zone audit logs"
ON public.zone_audit_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_zone_audit_logs_zone_id ON public.zone_audit_logs (zone_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.log_zone_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_changes := jsonb_build_object(
      'zone_name', jsonb_build_object('old', NULL, 'new', NEW.zone_name),
      'description', jsonb_build_object('old', NULL, 'new', NEW.description)
    );
    INSERT INTO public.zone_audit_logs (zone_id, zone_name, actor_id, action, changes)
    VALUES (NEW.zone_id, NEW.zone_name, auth.uid(), 'created', v_changes);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.zone_name IS DISTINCT FROM OLD.zone_name THEN
      v_changes := v_changes || jsonb_build_object('zone_name', jsonb_build_object('old', OLD.zone_name, 'new', NEW.zone_name));
    END IF;
    IF NEW.description IS DISTINCT FROM OLD.description THEN
      v_changes := v_changes || jsonb_build_object('description', jsonb_build_object('old', OLD.description, 'new', NEW.description));
    END IF;
    IF v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.zone_audit_logs (zone_id, zone_name, actor_id, action, changes)
    VALUES (NEW.zone_id, NEW.zone_name, auth.uid(), 'updated', v_changes);
    RETURN NEW;
  ELSE
    INSERT INTO public.zone_audit_logs (zone_id, zone_name, actor_id, action, changes)
    VALUES (OLD.zone_id, OLD.zone_name, auth.uid(), 'deleted',
      jsonb_build_object(
        'zone_name', jsonb_build_object('old', OLD.zone_name, 'new', NULL),
        'description', jsonb_build_object('old', OLD.description, 'new', NULL)
      ));
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER zones_log_changes
AFTER INSERT OR UPDATE OR DELETE ON public.zones
FOR EACH ROW EXECUTE FUNCTION private.log_zone_changes();