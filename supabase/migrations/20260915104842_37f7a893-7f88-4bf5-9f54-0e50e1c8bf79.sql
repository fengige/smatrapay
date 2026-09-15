ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS estate text,
  ADD COLUMN IF NOT EXISTS building_number text;

CREATE TABLE IF NOT EXISTS public.property_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text,
  category text NOT NULL DEFAULT 'other',
  is_primary boolean NOT NULL DEFAULT false,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_photos_property_idx ON public.property_photos(property_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_photos TO authenticated;
GRANT ALL ON public.property_photos TO service_role;

ALTER TABLE public.property_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage property photos"
ON public.property_photos FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Vendors view scoped property photos"
ON public.property_photos FOR SELECT TO authenticated
USING (
  property_id IN (SELECT s.property_id FROM private.vendor_scope_property_ids(auth.uid()) s(property_id))
);

CREATE POLICY "Owners view their property photos"
ON public.property_photos FOR SELECT TO authenticated
USING (
  property_id IN (SELECT p.id FROM public.properties p WHERE p.landlord_id = auth.uid())
);

CREATE TRIGGER property_photos_set_updated_at
BEFORE UPDATE ON public.property_photos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();