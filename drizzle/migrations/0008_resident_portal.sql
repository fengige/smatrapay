CREATE TABLE public.resident_token_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NOT NULL,
  meter_id uuid NOT NULL REFERENCES public.meters(id),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  phone text NOT NULL,
  request_id text NOT NULL UNIQUE,
  checkout_request_id text UNIQUE,
  mpesa_transaction_id uuid,
  mpesa_receipt_number text,
  status text NOT NULL DEFAULT 'initiated',
  token_id uuid,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resident_token_purchases_resident_idx ON public.resident_token_purchases(resident_id, created_at DESC);
GRANT SELECT ON public.resident_token_purchases TO authenticated;
GRANT ALL ON public.resident_token_purchases TO service_role;
ALTER TABLE public.resident_token_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Residents read own purchases" ON public.resident_token_purchases FOR SELECT TO authenticated USING (resident_id = auth.uid());
CREATE POLICY "Admins read purchases" ON public.resident_token_purchases FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER resident_token_purchases_set_updated_at BEFORE UPDATE ON public.resident_token_purchases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.resident_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NOT NULL,
  category text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  service_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.resident_feedback TO authenticated;
GRANT ALL ON public.resident_feedback TO service_role;
ALTER TABLE public.resident_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Residents read own feedback" ON public.resident_feedback FOR SELECT TO authenticated USING (resident_id = auth.uid());
CREATE POLICY "Residents add own feedback" ON public.resident_feedback FOR INSERT TO authenticated WITH CHECK (resident_id = auth.uid());
CREATE POLICY "Admins read feedback" ON public.resident_feedback FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.resident_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('ENQ-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  resident_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('insurance','loan','support')),
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'submitted',
  staff_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.resident_enquiries TO authenticated;
GRANT UPDATE ON public.resident_enquiries TO authenticated;
GRANT ALL ON public.resident_enquiries TO service_role;
ALTER TABLE public.resident_enquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Residents read own enquiries" ON public.resident_enquiries FOR SELECT TO authenticated USING (resident_id = auth.uid());
CREATE POLICY "Residents add own enquiries" ON public.resident_enquiries FOR INSERT TO authenticated WITH CHECK (resident_id = auth.uid() AND status = 'submitted' AND staff_response IS NULL);
CREATE POLICY "Admins manage enquiries" ON public.resident_enquiries FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER resident_enquiries_set_updated_at BEFORE UPDATE ON public.resident_enquiries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();