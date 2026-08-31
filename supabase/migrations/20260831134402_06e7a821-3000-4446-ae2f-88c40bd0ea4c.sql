CREATE TABLE public.payment_method_configurations (
  id uuid primary key default gen_random_uuid(),
  payment_method_id uuid not null references public.payment_methods(id) on delete cascade,
  environment text not null default 'sandbox' check (environment in ('sandbox','production')),
  enabled boolean not null default false,
  country text not null default 'KE',
  currency text not null default 'KES',
  consumer_key text,
  consumer_secret text,
  business_short_code text,
  passkey text,
  transaction_type text not null default 'CustomerPayBillOnline',
  account_reference text,
  transaction_desc text,
  stk_enabled boolean not null default true,
  c2b_enabled boolean not null default false,
  c2b_short_code text,
  c2b_response_type text not null default 'Completed',
  b2c_enabled boolean not null default false,
  b2c_initiator_name text,
  b2c_security_credential text,
  b2c_short_code text,
  b2c_occasion text,
  b2c_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_method_id, environment)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_method_configurations TO authenticated;
GRANT ALL ON public.payment_method_configurations TO service_role;
ALTER TABLE public.payment_method_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage payment method configurations"
  ON public.payment_method_configurations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER payment_method_configurations_set_updated_at
  BEFORE UPDATE ON public.payment_method_configurations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mpesa_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  environment text not null default 'sandbox',
  flow text not null default 'stk',
  merchant_request_id text,
  checkout_request_id text,
  transaction_id text,
  phone_number text,
  amount numeric(12,2),
  account_reference text,
  result_code text,
  result_desc text,
  mpesa_receipt_number text,
  transaction_date timestamptz,
  status text not null default 'pending',
  callback_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX mpesa_transactions_checkout_idx ON public.mpesa_transactions (checkout_request_id);

GRANT SELECT, INSERT, UPDATE ON public.mpesa_transactions TO authenticated;
GRANT ALL ON public.mpesa_transactions TO service_role;
ALTER TABLE public.mpesa_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage mpesa transactions"
  ON public.mpesa_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Payees view their mpesa transactions"
  ON public.mpesa_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER mpesa_transactions_set_updated_at
  BEFORE UPDATE ON public.mpesa_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();