CREATE TABLE IF NOT EXISTS public.property_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid,
  property_name text,
  actor_id uuid,
  action text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.property_audit_logs TO authenticated;
GRANT ALL ON public.property_audit_logs TO service_role;

ALTER TABLE public.property_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view property audit logs"
ON public.property_audit_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS property_audit_logs_property_idx
  ON public.property_audit_logs(property_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.log_property_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_col text;
  v_old jsonb;
  v_new jsonb;
  v_cols text[] := ARRAY['name','code','status','property_type','building_category','subtype',
    'number_of_units','landlord_id','zone_id','route_id','street_id',
    'address_line1','address_line2','city','state','country','postal_code','description'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.property_audit_logs (property_id, property_name, actor_id, action, changes)
    VALUES (NEW.id, NEW.name, auth.uid(), 'created',
      jsonb_build_object('name', jsonb_build_object('old', null, 'new', NEW.name)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    FOREACH v_col IN ARRAY v_cols LOOP
      v_old := to_jsonb(OLD) -> v_col;
      v_new := to_jsonb(NEW) -> v_col;
      IF v_old IS DISTINCT FROM v_new THEN
        v_changes := v_changes || jsonb_build_object(v_col, jsonb_build_object('old', v_old, 'new', v_new));
      END IF;
    END LOOP;
    IF v_changes <> '{}'::jsonb THEN
      INSERT INTO public.property_audit_logs (property_id, property_name, actor_id, action, changes)
      VALUES (NEW.id, NEW.name, auth.uid(), 'updated', v_changes);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.property_audit_logs (property_id, property_name, actor_id, action, changes)
    VALUES (NULL, OLD.name, auth.uid(), 'deleted',
      jsonb_build_object('name', jsonb_build_object('old', OLD.name, 'new', null)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS properties_log_changes ON public.properties;
CREATE TRIGGER properties_log_changes
AFTER INSERT OR UPDATE OR DELETE ON public.properties
FOR EACH ROW EXECUTE FUNCTION private.log_property_changes();