CREATE TABLE public.meter_price_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL,
  current_price numeric NOT NULL,
  requested_price numeric NOT NULL CHECK (requested_price >= 0),
  mode text NOT NULL,
  value numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  note text,
  review_note text,
  requested_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX meter_price_change_requests_status_idx ON public.meter_price_change_requests (status, created_at DESC);
CREATE INDEX meter_price_change_requests_vendor_idx ON public.meter_price_change_requests (vendor_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.meter_price_change_requests TO authenticated;
GRANT ALL ON public.meter_price_change_requests TO service_role;

ALTER TABLE public.meter_price_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage price change requests"
ON public.meter_price_change_requests FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Vendors view their own price change requests"
ON public.meter_price_change_requests FOR SELECT TO authenticated
USING (vendor_id = auth.uid() AND public.has_role(auth.uid(), 'vendor'));

CREATE POLICY "Vendors request price changes on their own meters"
ON public.meter_price_change_requests FOR INSERT TO authenticated
WITH CHECK (
  vendor_id = auth.uid()
  AND requested_by = auth.uid()
  AND status = 'pending'
  AND public.has_role(auth.uid(), 'vendor')
  AND EXISTS (
    SELECT 1 FROM public.meters m
    WHERE m.id = meter_id AND m.vendor_id::text = auth.uid()::text
  )
);

CREATE TRIGGER meter_price_change_requests_set_updated_at
BEFORE UPDATE ON public.meter_price_change_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();