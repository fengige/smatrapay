DO $$
DECLARE
  admin_id uuid;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@smatrapay.com' LIMIT 1;
  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'admin@smatrapay.com auth user not found';
  END IF;

  INSERT INTO public.profiles (id, name, username, email, email_verified_at, status)
  VALUES (admin_id, 'Platform Admin', 'admin@smatrapay.com', 'admin@smatrapay.com', now(), 'active')
  ON CONFLICT (id) DO UPDATE
    SET name = 'Platform Admin',
        username = 'admin@smatrapay.com',
        email = 'admin@smatrapay.com',
        email_verified_at = COALESCE(public.profiles.email_verified_at, now()),
        status = 'active',
        updated_at = now();

  DELETE FROM public.user_roles WHERE user_id = admin_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (admin_id, 'admin');
END $$;