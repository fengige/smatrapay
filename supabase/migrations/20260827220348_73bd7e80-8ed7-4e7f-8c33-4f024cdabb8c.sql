CREATE TABLE public.unit_audit_logs (
  id uuid not null default gen_random_uuid() primary key,
  unit_id uuid not null references public.units(id) on delete cascade,
  actor_id uuid,
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);
GRANT SELECT, INSERT ON public.unit_audit_logs TO authenticated;
GRANT ALL ON public.unit_audit_logs TO service_role;
ALTER TABLE public.unit_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view unit audit logs" ON public.unit_audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert unit audit logs" ON public.unit_audit_logs FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION private.log_unit_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_field text;
  v_fields text[] := ARRAY['unit_number','building','unit_type','bedrooms','floor','status','electricity_meter_no','water_meter_no','gas_meter_no','notes'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.unit_audit_logs (unit_id, actor_id, action, changes)
    VALUES (NEW.id, auth.uid(), 'created', jsonb_build_object('unit_number', jsonb_build_object('old', null, 'new', NEW.unit_number), 'status', jsonb_build_object('old', null, 'new', NEW.status)));
    RETURN NEW;
  END IF;

  FOREACH v_field IN ARRAY v_fields LOOP
    IF to_jsonb(OLD) -> v_field IS DISTINCT FROM to_jsonb(NEW) -> v_field THEN
      v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('old', to_jsonb(OLD) -> v_field, 'new', to_jsonb(NEW) -> v_field));
    END IF;
  END LOOP;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.unit_audit_logs (unit_id, actor_id, action, changes)
    VALUES (NEW.id, auth.uid(), 'updated', v_changes);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER units_log_changes
AFTER INSERT OR UPDATE ON public.units
FOR EACH ROW EXECUTE FUNCTION private.log_unit_changes();