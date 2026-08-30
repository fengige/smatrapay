CREATE TABLE public.user_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_audit_logs TO authenticated;
GRANT ALL ON public.user_audit_logs TO service_role;

ALTER TABLE public.user_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view user audit logs"
ON public.user_audit_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE INDEX user_audit_logs_user_id_created_at_idx
  ON public.user_audit_logs (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.log_user_profile_image_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text := NULLIF(OLD.profile_image, '');
  v_new text := NULLIF(NEW.profile_image, '');
  v_action text;
BEGIN
  IF v_old IS NOT DISTINCT FROM v_new THEN
    RETURN NEW;
  END IF;

  IF v_new IS NULL THEN
    v_action := 'profile_image_removed';
  ELSIF v_old IS NULL THEN
    v_action := 'profile_image_uploaded';
  ELSE
    v_action := 'profile_image_updated';
  END IF;

  INSERT INTO public.user_audit_logs (user_id, actor_id, action, changes)
  VALUES (
    NEW.id,
    auth.uid(),
    v_action,
    jsonb_build_object(
      'profile_image', jsonb_build_object('from', v_old, 'to', v_new)
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER users_log_profile_image_changes
AFTER UPDATE OF profile_image ON public.users
FOR EACH ROW EXECUTE FUNCTION private.log_user_profile_image_changes();

ALTER PUBLICATION supabase_realtime ADD TABLE public.meters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meter_audit_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_audit_logs;