CREATE TYPE public.payment_status AS ENUM ('pending', 'completed', 'failed', 'cancelled');

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payee_type text NOT NULL CHECK (payee_type IN ('landlord','agent','vendor')),
  payee_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  payment_account_id uuid REFERENCES public.payment_method_accounts(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'KES',
  status public.payment_status NOT NULL DEFAULT 'pending',
  reference text,
  description text,
  paid_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payments_payee_idx ON public.payments (payee_type, payee_id);
CREATE INDEX payments_status_idx ON public.payments (status);
CREATE INDEX payments_created_at_idx ON public.payments (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all payments"
ON public.payments FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Payees can view their payments"
ON public.payments FOR SELECT TO authenticated
USING (payee_id = auth.uid());

CREATE TRIGGER payments_set_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();