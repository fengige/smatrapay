ALTER TABLE public.vending_software
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS version text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

UPDATE public.vending_software
SET code = upper(regexp_replace(name, '[^a-zA-Z0-9]+', '_', 'g'))
WHERE code IS NULL OR btrim(code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS vending_software_code_key
  ON public.vending_software (upper(code)) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vending_software_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vending_software_id uuid REFERENCES public.vending_software(vending_software_id) ON DELETE SET NULL,
  software_name text,
  meter_id uuid,
  actor_id uuid,
  action text NOT NULL,
  previous_status text,
  new_status text,
  reason text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.vending_software_audit_logs TO authenticated;
GRANT ALL ON public.vending_software_audit_logs TO service_role;

ALTER TABLE public.vending_software_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read vending software history" ON public.vending_software_audit_logs;
CREATE POLICY "Admins read vending software history"
  ON public.vending_software_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated write vending software history" ON public.vending_software_audit_logs;
CREATE POLICY "Authenticated write vending software history"
  ON public.vending_software_audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS vending_software_audit_logs_software_idx
  ON public.vending_software_audit_logs (vending_software_id, created_at DESC);

-- admin-only writes on vending_software
DROP POLICY IF EXISTS "Admins manage vending software" ON public.vending_software;
CREATE POLICY "Admins manage vending software"
  ON public.vending_software FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vending_software TO authenticated;
GRANT ALL ON public.vending_software TO service_role;

-- automatic meter assignment history
CREATE OR REPLACE FUNCTION public.log_meter_vending_software_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vending_software_id IS NOT NULL THEN
      INSERT INTO public.vending_software_audit_logs
        (vending_software_id, software_name, meter_id, actor_id, action, changes)
      SELECT NEW.vending_software_id, vs.name, NEW.id, auth.uid(), 'meter_assigned',
             jsonb_build_object('meter_number', NEW.meter_number)
      FROM public.vending_software vs WHERE vs.vending_software_id = NEW.vending_software_id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.vending_software_id IS DISTINCT FROM OLD.vending_software_id THEN
    IF OLD.vending_software_id IS NOT NULL THEN
      INSERT INTO public.vending_software_audit_logs
        (vending_software_id, software_name, meter_id, actor_id, action, changes)
      SELECT OLD.vending_software_id, vs.name, NEW.id, auth.uid(), 'meter_removed',
             jsonb_build_object('meter_number', NEW.meter_number)
      FROM public.vending_software vs WHERE vs.vending_software_id = OLD.vending_software_id;
    END IF;
    IF NEW.vending_software_id IS NOT NULL THEN
      INSERT INTO public.vending_software_audit_logs
        (vending_software_id, software_name, meter_id, actor_id, action, changes)
      SELECT NEW.vending_software_id, vs.name, NEW.id, auth.uid(), 'meter_assigned',
             jsonb_build_object('meter_number', NEW.meter_number)
      FROM public.vending_software vs WHERE vs.vending_software_id = NEW.vending_software_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meters_vending_software_audit ON public.meters;
CREATE TRIGGER meters_vending_software_audit
AFTER INSERT OR UPDATE OF vending_software_id ON public.meters
FOR EACH ROW EXECUTE FUNCTION public.log_meter_vending_software_change();