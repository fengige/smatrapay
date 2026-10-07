CREATE TABLE public.ncba_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trans_id text NOT NULL UNIQUE,
  trans_type text,
  ft_ref text,
  trans_time text,
  trans_amount numeric(15,2),
  business_short_code text,
  bill_ref_number text,
  narrative text,
  mobile text,
  payer_name text,
  meter_id uuid REFERENCES public.meters(id),
  meter_number text,
  token_id uuid REFERENCES public.meter_tokens(id),
  status text NOT NULL DEFAULT 'received',
  error_code text,
  error_message text,
  sms_status text,
  attempts integer NOT NULL DEFAULT 0,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ncba_notifications TO authenticated;
GRANT ALL ON public.ncba_notifications TO service_role;
ALTER TABLE public.ncba_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read NCBA notifications" ON public.ncba_notifications FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER ncba_notifications_set_updated_at BEFORE UPDATE ON public.ncba_notifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();