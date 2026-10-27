CREATE TABLE public.payg_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resident_id uuid NOT NULL REFERENCES public.users(id), vendor_id uuid NOT NULL REFERENCES public.users(id), product_id uuid NOT NULL REFERENCES public.payg_products(id), product_name text NOT NULL,
 down_payment_cents bigint NOT NULL CHECK (down_payment_cents >= 0), instalment_cents bigint NOT NULL CHECK (instalment_cents > 0), instalment_count integer NOT NULL CHECK (instalment_count > 0), frequency text NOT NULL CHECK (frequency IN ('daily','weekly','monthly')), total_cents bigint NOT NULL CHECK (total_cents > 0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(resident_id,product_id), CHECK(total_cents = down_payment_cents + instalment_cents * instalment_count)
);
GRANT SELECT ON public.payg_plans TO authenticated;
GRANT ALL ON public.payg_plans TO service_role;
ALTER TABLE public.payg_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY payg_plan_scoped_read ON public.payg_plans FOR SELECT TO authenticated USING ((resident_id=auth.uid() AND public.has_role(auth.uid(),'resident')) OR (vendor_id=auth.uid() AND public.has_role(auth.uid(),'vendor')) OR public.has_role(auth.uid(),'admin'));
CREATE TABLE public.payg_payment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES public.payg_plans(id), resident_id uuid NOT NULL REFERENCES public.users(id), request_id uuid NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents > 0 AND amount_cents % 100 = 0), phone text NOT NULL,
 status text NOT NULL DEFAULT 'initiated' CHECK(status IN ('initiated','pending','uncertain','completed','failed')), config_id uuid NOT NULL REFERENCES public.payment_method_configurations(id), callback_hash text NOT NULL, checkout_request_id text UNIQUE, merchant_request_id text, mpesa_transaction_id uuid REFERENCES public.mpesa_transactions(id), receipt text UNIQUE, error_message text, confirmed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(resident_id,request_id)
);
GRANT SELECT ON public.payg_payment_attempts TO authenticated;
GRANT ALL ON public.payg_payment_attempts TO service_role;
ALTER TABLE public.payg_payment_attempts ENABLE ROW LEVEL SECURITY;
-- Attempt credentials/callback capability are service-only; residents receive projected DTOs through scoped functions.
REVOKE SELECT ON public.payg_payment_attempts FROM authenticated;
CREATE INDEX payg_attempt_plan_idx ON public.payg_payment_attempts(plan_id,created_at);
CREATE UNIQUE INDEX payg_one_pending_payment ON public.payg_payment_attempts(plan_id) WHERE status IN ('initiated','pending','uncertain');
CREATE FUNCTION public.begin_payg_payment(p_plan uuid,p_resident uuid,p_request uuid,p_phone text,p_config uuid,p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE plan public.payg_plans; attempt public.payg_payment_attempts; paid bigint; due bigint;
BEGIN
 SELECT * INTO plan FROM public.payg_plans WHERE id=p_plan AND resident_id=p_resident FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found'; END IF;
 SELECT * INTO attempt FROM public.payg_payment_attempts WHERE resident_id=p_resident AND request_id=p_request;
 IF FOUND THEN
  IF attempt.plan_id <> p_plan THEN RAISE EXCEPTION 'Request belongs to another plan'; END IF;
  RETURN jsonb_build_object('id',attempt.id,'status',attempt.status,'created',false);
 END IF;
 SELECT * INTO attempt FROM public.payg_payment_attempts WHERE plan_id=p_plan AND status IN ('initiated','pending','uncertain') LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('id',attempt.id,'status',attempt.status,'created',false); END IF;
 SELECT COALESCE(sum(amount_cents),0) INTO paid FROM public.payg_payment_attempts WHERE plan_id=p_plan AND status='completed';
 IF paid >= plan.total_cents THEN RAISE EXCEPTION 'Plan already paid'; END IF;
 due := CASE WHEN paid < plan.down_payment_cents THEN plan.down_payment_cents-paid ELSE LEAST(plan.instalment_cents,plan.total_cents-paid) END;
 INSERT INTO public.payg_payment_attempts(plan_id,resident_id,request_id,phone,amount_cents,config_id,callback_hash) VALUES(p_plan,p_resident,p_request,p_phone,due,p_config,p_hash) RETURNING * INTO attempt;
 RETURN jsonb_build_object('id',attempt.id,'status',attempt.status,'created',true,'amount_cents',attempt.amount_cents);
END $$;
REVOKE ALL ON FUNCTION public.begin_payg_payment(uuid,uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_payg_payment(uuid,uuid,uuid,text,uuid,text) TO service_role;
CREATE FUNCTION public.confirm_payg_payment(p_attempt uuid,p_success boolean,p_receipt text,p_message text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.payg_payment_attempts;
BEGIN
 SELECT * INTO a FROM public.payg_payment_attempts WHERE id=p_attempt FOR UPDATE;
 IF NOT FOUND OR a.status IN ('completed','failed') THEN RETURN false; END IF;
 UPDATE public.payg_payment_attempts SET status=CASE WHEN p_success THEN 'completed' ELSE 'failed' END, receipt=CASE WHEN p_success THEN p_receipt ELSE NULL END, error_message=CASE WHEN p_success THEN NULL ELSE p_message END, confirmed_at=now() WHERE id=a.id;
 UPDATE public.mpesa_transactions SET status=CASE WHEN p_success THEN 'completed' ELSE 'failed' END, mpesa_receipt_number=CASE WHEN p_success THEN p_receipt ELSE NULL END, result_desc=CASE WHEN p_success THEN 'Pay-as-you-go payment verified' ELSE p_message END WHERE id=a.mpesa_transaction_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.confirm_payg_payment(uuid,boolean,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payg_payment(uuid,boolean,text,text) TO service_role;