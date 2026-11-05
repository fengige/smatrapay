ALTER TABLE public.bank_notifications ADD COLUMN meter_corrections jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE OR REPLACE FUNCTION public.correct_bank_payment_meter_for_retry(p_id uuid, p_meter text, p_updated_at timestamptz, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n public.bank_notifications; m public.meters; actor uuid := auth.uid(); admin boolean := public.has_role(auth.uid(),'admin'); bank_key text;
BEGIN
 IF actor IS NULL OR NOT (admin OR public.has_role(actor,'vendor')) THEN RAISE EXCEPTION 'Access denied'; END IF;
 SELECT * INTO n FROM public.bank_notifications WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
 IF NOT admin AND NOT EXISTS (SELECT 1 FROM public.meters WHERE meter_number=n.meter_number AND vendor_id=actor::text) THEN RAISE EXCEPTION 'Payment not found'; END IF;
 IF n.updated_at IS DISTINCT FROM p_updated_at THEN RAISE EXCEPTION 'Payment changed. Refresh and try again.'; END IF;
 IF n.status NOT IN ('failed','retry_pending','rejected') OR n.token_id IS NOT NULL OR n.processed_at IS NOT NULL THEN RAISE EXCEPTION 'This payment cannot be redirected to another meter. Reconcile it first.'; END IF;
 IF n.bank='SIDIAN' AND coalesce(n.payment_status,'') <> '0' THEN RAISE EXCEPTION 'Bank payment is not confirmed'; END IF;
 IF length(btrim(p_meter)) NOT BETWEEN 1 AND 64 OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Meter and correction reason are required'; END IF;
 SELECT * INTO m FROM public.meters WHERE meter_number=btrim(p_meter) FOR SHARE;
 IF NOT FOUND OR (NOT admin AND m.vendor_id IS DISTINCT FROM actor::text) THEN RAISE EXCEPTION 'Meter not found or not available to you'; END IF;
 IF m.status <> 'active' THEN RAISE EXCEPTION 'Choose an active meter'; END IF;
 bank_key := lower(coalesce(n.bank,'NCBA')) || ':' || n.trans_id;
 IF EXISTS (SELECT 1 FROM public.meter_tokens WHERE right(idempotency_key,length(':credit:'||bank_key))=':credit:'||bank_key) THEN RAISE EXCEPTION 'A token already exists for this payment. Reconcile it first.'; END IF;
 UPDATE public.bank_notifications SET meter_number=m.meter_number, meter_id=m.id, status='processing', next_retry_at=NULL,
 attempts=coalesce(attempts,0)+1, last_retry_by=actor,
 meter_corrections=meter_corrections || jsonb_build_array(jsonb_build_object('previous_meter',n.meter_number,'new_meter',m.meter_number,'actor_id',actor,'changed_at',now(),'reason',btrim(p_reason)))
 WHERE id=n.id RETURNING * INTO n;
 RETURN to_jsonb(n);
END $$;
REVOKE ALL ON FUNCTION public.correct_bank_payment_meter_for_retry(uuid,text,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_bank_payment_meter_for_retry(uuid,text,timestamptz,text) TO authenticated;
COMMENT ON COLUMN public.bank_notifications.meter_corrections IS 'Append-only server-managed meter correction history; original bank narrative and payment identity remain unchanged.';