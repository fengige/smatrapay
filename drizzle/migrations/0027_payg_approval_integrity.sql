CREATE OR REPLACE FUNCTION public.guard_payg_charge_approval() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.payg_plans p JOIN public.payg_applications a ON a.id=p.application_id JOIN public.payg_products pr ON pr.id=p.product_id JOIN public.payment_method_configurations c ON c.id=NEW.config_id WHERE p.id=NEW.plan_id AND p.resident_id=NEW.resident_id AND a.status='approved' AND pr.approval_status='approved' AND pr.is_active AND pr.deleted_at IS NULL AND c.owner_id=p.vendor_id AND c.enabled AND c.stk_enabled AND c.environment='production' AND c.country='KE' AND c.currency='KES') THEN RAISE EXCEPTION 'Approved product, application and vendor payment account required'; END IF;
 RETURN NEW; END $$;
CREATE FUNCTION public.audit_payg_product_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF public.has_role(auth.uid(),'admin') THEN
 INSERT INTO public.payg_review_events(actor_id,entity_id,action,note) VALUES(auth.uid(),NEW.id,CASE WHEN NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN 'product_deleted' WHEN NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN 'product_'||NEW.approval_status ELSE 'product_edited' END,NEW.review_note);
 END IF; RETURN NEW; END $$;
CREATE TRIGGER payg_product_review_audit AFTER UPDATE ON public.payg_products FOR EACH ROW EXECUTE FUNCTION public.audit_payg_product_review();
CREATE FUNCTION public.guard_payg_application_insert() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 PERFORM 1 FROM public.payg_products p WHERE p.id=NEW.product_id AND p.vendor_id=NEW.vendor_id AND p.approval_status='approved' AND p.is_active AND p.deleted_at IS NULL AND NEW.terms=jsonb_build_object('down_payment_cents',(p.down_payment*100)::bigint,'instalment_cents',(p.instalment_amount*100)::bigint,'instalment_count',p.instalment_count,'frequency',p.instalment_frequency,'total_cents',((p.down_payment+p.instalment_amount*p.instalment_count)*100)::bigint) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved product with matching terms required'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER payg_application_insert BEFORE INSERT ON public.payg_applications FOR EACH ROW EXECUTE FUNCTION public.guard_payg_application_insert();