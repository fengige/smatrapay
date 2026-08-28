CREATE TABLE public.meters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id text NOT NULL,
  landlord_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  meter_number text NOT NULL UNIQUE,
  serial_number text NOT NULL,
  type text NOT NULL,
  initial_reading numeric(15,2) NOT NULL DEFAULT 0,
  price_per_unit numeric(15,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  sgc integer,
  krn integer,
  ti integer,
  ea integer,
  ken integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.meters.sgc IS 'Supply Group Code';
COMMENT ON COLUMN public.meters.krn IS 'Key Revision Number';
COMMENT ON COLUMN public.meters.ti IS 'Tariff Index';
COMMENT ON COLUMN public.meters.ea IS 'Encryption Algorithm';
COMMENT ON COLUMN public.meters.ken IS 'Key Expiry Number';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meters TO authenticated;
GRANT ALL ON public.meters TO service_role;

ALTER TABLE public.meters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view meters" ON public.meters FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert meters" ON public.meters FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update meters" ON public.meters FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete meters" ON public.meters FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Landlords can view their meters" ON public.meters FOR SELECT TO authenticated USING (auth.uid() = landlord_id);

CREATE TRIGGER meters_set_updated_at BEFORE UPDATE ON public.meters FOR EACH ROW EXECUTE FUNCTION set_updated_at();