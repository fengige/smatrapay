ALTER TABLE public.meters ADD COLUMN supplier_id uuid REFERENCES public.meter_suppliers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS meters_supplier_id_idx ON public.meters(supplier_id);