CREATE TABLE public.assignment_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid,
  user_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  old_unit_id uuid,
  new_unit_id uuid,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assignment_audit_logs_user_idx ON public.assignment_audit_logs (user_id, created_at DESC);
CREATE INDEX assignment_audit_logs_unit_idx ON public.assignment_audit_logs (new_unit_id);

GRANT SELECT ON public.assignment_audit_logs TO authenticated;
GRANT ALL ON public.assignment_audit_logs TO service_role;

ALTER TABLE public.assignment_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view assignment audit logs"
ON public.assignment_audit_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own assignment audit logs"
ON public.assignment_audit_logs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION private.log_assignment_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.assignment_audit_logs (assignment_id, user_id, actor_id, action, old_unit_id, new_unit_id, changes)
    VALUES (NEW.id, NEW.user_id, auth.uid(), 'assigned', NULL, NEW.unit_id,
      jsonb_build_object(
        'role', NEW.role,
        'start_date', NEW.start_date,
        'end_date', NEW.end_date,
        'notes', NEW.notes
      ));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.unit_id IS DISTINCT FROM OLD.unit_id THEN
      v_changes := v_changes || jsonb_build_object('unit_id', jsonb_build_object('old', OLD.unit_id, 'new', NEW.unit_id));
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      v_changes := v_changes || jsonb_build_object('user_id', jsonb_build_object('old', OLD.user_id, 'new', NEW.user_id));
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      v_changes := v_changes || jsonb_build_object('role', jsonb_build_object('old', OLD.role, 'new', NEW.role));
    END IF;
    IF NEW.start_date IS DISTINCT FROM OLD.start_date THEN
      v_changes := v_changes || jsonb_build_object('start_date', jsonb_build_object('old', OLD.start_date, 'new', NEW.start_date));
    END IF;
    IF NEW.end_date IS DISTINCT FROM OLD.end_date THEN
      v_changes := v_changes || jsonb_build_object('end_date', jsonb_build_object('old', OLD.end_date, 'new', NEW.end_date));
    END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      v_changes := v_changes || jsonb_build_object('notes', jsonb_build_object('old', OLD.notes, 'new', NEW.notes));
    END IF;

    IF v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.assignment_audit_logs (assignment_id, user_id, actor_id, action, old_unit_id, new_unit_id, changes)
    VALUES (
      NEW.id,
      NEW.user_id,
      auth.uid(),
      CASE
        WHEN NEW.unit_id IS DISTINCT FROM OLD.unit_id THEN 'moved'
        WHEN OLD.end_date IS NULL AND NEW.end_date IS NOT NULL THEN 'ended'
        ELSE 'updated'
      END,
      OLD.unit_id,
      NEW.unit_id,
      v_changes
    );
    RETURN NEW;
  ELSE
    INSERT INTO public.assignment_audit_logs (assignment_id, user_id, actor_id, action, old_unit_id, new_unit_id, changes)
    VALUES (OLD.id, OLD.user_id, auth.uid(), 'removed', OLD.unit_id, NULL,
      jsonb_build_object(
        'role', OLD.role,
        'start_date', OLD.start_date,
        'end_date', OLD.end_date
      ));
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER unit_assignments_log_changes
AFTER INSERT OR UPDATE OR DELETE ON public.unit_assignments
FOR EACH ROW EXECUTE FUNCTION private.log_assignment_changes();