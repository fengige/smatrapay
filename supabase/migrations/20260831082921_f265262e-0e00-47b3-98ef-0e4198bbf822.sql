CREATE TABLE public.payment_method_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method_id uuid NOT NULL REFERENCES public.payment_methods(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_type text NOT NULL CHECK (user_type IN ('landlord','agent','vendor')),
  landlord_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  account_name text,
  account_number text NOT NULL,
  bank_name text,
  branch text,
  paybill_number text,
  details text,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payment_method_accounts_unique_account
  ON public.payment_method_accounts (user_id, payment_method_id, lower(account_number));

CREATE UNIQUE INDEX payment_method_accounts_one_default
  ON public.payment_method_accounts (user_id, payment_method_id)
  WHERE is_default;

CREATE INDEX payment_method_accounts_user_idx ON public.payment_method_accounts (user_id);
CREATE INDEX payment_method_accounts_method_idx ON public.payment_method_accounts (payment_method_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_method_accounts TO authenticated;
GRANT ALL ON public.payment_method_accounts TO service_role;

ALTER TABLE public.payment_method_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage payment accounts"
ON public.payment_method_accounts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners can view their payment accounts"
ON public.payment_method_accounts FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER payment_method_accounts_set_updated_at
BEFORE UPDATE ON public.payment_method_accounts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();