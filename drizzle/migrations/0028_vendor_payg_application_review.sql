CREATE OR REPLACE FUNCTION public.review_payg_application(p_id uuid,p_status text,p_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE a public.payg_applications; t jsonb; is_admin boolean := public.has_role(auth.uid(),'admin'); BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
 IF p_status NOT IN ('approved','declined') OR char_length(coalesce(p_note,''))>1000 THEN RAISE EXCEPTION 'Invalid review'; END IF;
 SELECT * INTO a FROM public.payg_applications WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
 IF NOT is_admin AND NOT (a.vendor_id=auth.uid() AND public.has_role(auth.uid(),'vendor')) THEN RAISE EXCEPTION 'Application not found'; END IF;
 IF a.status<>'pending' THEN RAISE EXCEPTION 'Application already reviewed'; END IF;
 IF p_status='approved' THEN
  PERFORM 1 FROM public.payg_products WHERE id=a.product_id AND vendor_id=a.vendor_id AND approval_status='approved' AND is_active AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product is not approved'; END IF;
  t:=a.terms;
  INSERT INTO public.payg_plans(resident_id,vendor_id,product_id,product_name,down_payment_cents,instalment_cents,instalment_count,frequency,total_cents,application_id) VALUES(a.resident_id,a.vendor_id,a.product_id,a.product_name,(t->>'down_payment_cents')::bigint,(t->>'instalment_cents')::bigint,(t->>'instalment_count')::integer,t->>'frequency',(t->>'total_cents')::bigint,a.id);
 END IF;
 UPDATE public.payg_applications SET status=p_status,review_note=p_note,reviewed_by=auth.uid(),reviewed_at=now() WHERE id=a.id;
 INSERT INTO public.payg_review_events(actor_id,entity_id,action,note) VALUES(auth.uid(),a.id,CASE WHEN is_admin THEN p_status ELSE 'vendor_'||p_status END,p_note);
END $$;
REVOKE ALL ON FUNCTION public.review_payg_application(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_payg_application(uuid,text,text) TO authenticated;
CREATE POLICY payg_review_vendor_read ON public.payg_review_events FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'vendor') AND EXISTS(SELECT 1 FROM public.payg_applications a WHERE a.id=entity_id AND a.vendor_id=auth.uid()));