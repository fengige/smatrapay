CREATE TABLE public.vending_software (
  vending_software_id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vending_software TO authenticated;
GRANT ALL ON public.vending_software TO service_role;

ALTER TABLE public.vending_software ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view vending software"
  ON public.vending_software
  FOR SELECT
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_vending_software_updated_at
  BEFORE UPDATE ON public.vending_software
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();