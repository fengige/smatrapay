ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS number_of_units integer,
  ADD COLUMN IF NOT EXISTS landlord_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS properties_landlord_id_idx ON public.properties(landlord_id);