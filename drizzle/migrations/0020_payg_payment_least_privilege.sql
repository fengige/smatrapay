REVOKE ALL ON public.payg_plans FROM anon,authenticated;
GRANT SELECT ON public.payg_plans TO authenticated;
REVOKE ALL ON public.payg_payment_attempts FROM anon,authenticated;
GRANT ALL ON public.payg_plans, public.payg_payment_attempts TO service_role;
CREATE OR REPLACE FUNCTION public.confirm_payg_payment(p_attempt uuid,p_success boolean,p_receipt text,p_message text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.payg_payment_attempts;
BEGIN
 SELECT * INTO a FROM public.payg_payment_attempts WHERE id=p_attempt FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF a.status='completed' THEN
  IF p_success AND p_receipt IS NOT NULL AND a.receipt IS NULL THEN
   UPDATE public.payg_payment_attempts SET receipt=p_receipt WHERE id=a.id;
   UPDATE public.mpesa_transactions SET mpesa_receipt_number=p_receipt WHERE id=a.mpesa_transaction_id;
  END IF;
  RETURN false;
 END IF;
 IF a.status='failed' THEN RETURN false; END IF;
 UPDATE public.payg_payment_attempts SET status=CASE WHEN p_success THEN 'completed' ELSE 'failed' END, receipt=CASE WHEN p_success THEN p_receipt ELSE NULL END, error_message=CASE WHEN p_success THEN NULL ELSE p_message END, confirmed_at=now() WHERE id=a.id;
 UPDATE public.mpesa_transactions SET status=CASE WHEN p_success THEN 'completed' ELSE 'failed' END, mpesa_receipt_number=CASE WHEN p_success THEN p_receipt ELSE NULL END, result_desc=CASE WHEN p_success THEN 'Pay-as-you-go payment verified' ELSE p_message END WHERE id=a.mpesa_transaction_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.confirm_payg_payment(uuid,boolean,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payg_payment(uuid,boolean,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.begin_payg_payment(uuid,uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_payg_payment(uuid,uuid,uuid,text,uuid,text) TO service_role;