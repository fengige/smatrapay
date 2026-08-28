CREATE TABLE public.address_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL DEFAULT 'update',
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.address_audit_logs TO authenticated;
GRANT ALL ON public.address_audit_logs TO service_role;

ALTER TABLE public.address_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view address audit logs"
  ON public.address_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert address audit logs"
  ON public.address_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.log_address_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changes jsonb := '{}'::jsonb;
BEGIN
  IF OLD.address_line1 IS DISTINCT FROM NEW.address_line1 THEN
    changes := jsonb_insert(changes, '{address_line1}', jsonb_build_object('old', OLD.address_line1, 'new', NEW.address_line1));
  END IF;
  IF OLD.address_line2 IS DISTINCT FROM NEW.address_line2 THEN
    changes := jsonb_insert(changes, '{address_line2}', jsonb_build_object('old', OLD.address_line2, 'new', NEW.address_line2));
  END IF;
  IF OLD.city IS DISTINCT FROM NEW.city THEN
    changes := jsonb_insert(changes, '{city}', jsonb_build_object('old', OLD.city, 'new', NEW.city));
  END IF;
  IF OLD.state IS DISTINCT FROM NEW.state THEN
    changes := jsonb_insert(changes, '{state}', jsonb_build_object('old', OLD.state, 'new', NEW.state));
  END IF;
  IF OLD.country IS DISTINCT FROM NEW.country THEN
    changes := jsonb_insert(changes, '{country}', jsonb_build_object('old', OLD.country, 'new', NEW.country));
  END IF;
  IF OLD.postal_code IS DISTINCT FROM NEW.postal_code THEN
    changes := jsonb_insert(changes, '{postal_code}', jsonb_build_object('old', OLD.postal_code, 'new', NEW.postal_code));
  END IF;

  IF changes != '{}'::jsonb THEN
    INSERT INTO public.address_audit_logs (property_id, actor_id, action, changes)
    VALUES (NEW.id, NEW.updated_by, 'update', changes);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER address_audit_logs_trigger
AFTER UPDATE ON public.properties
FOR EACH ROW
EXECUTE FUNCTION public.log_address_changes();