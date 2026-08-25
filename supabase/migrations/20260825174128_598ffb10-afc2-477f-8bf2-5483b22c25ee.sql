ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS property text,
  ADD COLUMN IF NOT EXISTS building text,
  ADD COLUMN IF NOT EXISTS unit_number text,
  ADD COLUMN IF NOT EXISTS move_in_date date;