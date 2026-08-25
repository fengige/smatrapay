ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS profile_image text,
  ADD COLUMN IF NOT EXISTS profile_image_url text;