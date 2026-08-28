ALTER TABLE public.meters
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS meters_unit_id_idx ON public.meters (unit_id);

CREATE TABLE IF NOT EXISTS public.meter_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL DEFAULT 'update',
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.meter_audit_logs TO authenticated;
GRANT ALL ON public.meter_audit_logs TO service_role;

ALTER TABLE public.meter_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view meter audit logs"
  ON public.meter_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners can view their meter audit logs"
  ON public.meter_audit_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.meters m
    WHERE m.id = meter_audit_logs.meter_id
      AND (m.landlord_id = auth.uid() OR m.agent_id = auth.uid())
  ));

CREATE INDEX IF NOT EXISTS meter_audit_logs_meter_id_idx ON public.meter_audit_logs (meter_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.log_meter_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
BEGIN
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

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.meter_audit_logs (meter_id, actor_id, action, changes)
    VALUES (NEW.id, auth.uid(), 'update', v_changes);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meters_log_changes ON public.meters;
CREATE TRIGGER meters_log_changes
  AFTER UPDATE ON public.meters
  FOR EACH ROW EXECUTE FUNCTION private.log_meter_changes();