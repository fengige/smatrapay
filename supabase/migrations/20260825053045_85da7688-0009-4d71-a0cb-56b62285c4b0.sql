ALTER TABLE public.profiles RENAME TO users;

ALTER TRIGGER profiles_set_updated_at ON public.users RENAME TO users_set_updated_at;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role public.app_role;
BEGIN
  INSERT INTO public.users (id, name, email, email_verified_at, username, phone, profile_image, created_by, updated_by)
  VALUES (
    NEW.id,
    NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
    NEW.email,
    NEW.email_confirmed_at,
    NULLIF(NEW.raw_user_meta_data ->> 'username', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'phone', ''), NEW.phone),
    NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', ''),
    NEW.id,
    NEW.id
  )
  ON CONFLICT (id) DO NOTHING;

  v_role := 'resident';

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;