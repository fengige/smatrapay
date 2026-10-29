ALTER TABLE public.payg_products ADD COLUMN approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','declined')), ADD COLUMN deleted_at timestamptz, ADD COLUMN review_note text;
CREATE POLICY "Admins manage payg products" ON public.payg_products FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.guard_payg_product_review() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NOT public.has_role(auth.uid(),'admin') AND current_user <> 'service_role' THEN
  IF TG_OP='INSERT' THEN NEW.approval_status:='pending'; NEW.deleted_at:=NULL; NEW.review_note:=NULL;
  ELSE
   IF NEW.vendor_id<>OLD.vendor_id OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN RAISE EXCEPTION 'Ownership and deletion are protected'; END IF;
   NEW.approval_status:='pending'; NEW.review_note:=NULL;
  END IF;
 END IF;
 RETURN NEW; END $$;
CREATE TRIGGER payg_product_review BEFORE INSERT OR UPDATE ON public.payg_products FOR EACH ROW EXECUTE FUNCTION public.guard_payg_product_review();
CREATE TABLE public.payg_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resident_id uuid NOT NULL, vendor_id uuid NOT NULL, product_id uuid NOT NULL REFERENCES public.payg_products(id), product_name text NOT NULL,
 full_name text NOT NULL CHECK(char_length(full_name) BETWEEN 2 AND 120), phone text NOT NULL, delivery_address text NOT NULL CHECK(char_length(delivery_address) BETWEEN 5 AND 500), notes text NOT NULL DEFAULT '' CHECK(char_length(notes)<=1000),
 terms jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined')), review_note text CHECK(char_length(review_note)<=1000), reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(resident_id,product_id)
);
GRANT SELECT ON public.payg_applications TO authenticated;
GRANT ALL ON public.payg_applications TO service_role;
ALTER TABLE public.payg_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY payg_applications_scoped_read ON public.payg_applications FOR SELECT TO authenticated USING((resident_id=auth.uid() AND public.has_role(auth.uid(),'resident')) OR (vendor_id=auth.uid() AND public.has_role(auth.uid(),'vendor')) OR public.has_role(auth.uid(),'admin'));
ALTER TABLE public.payg_plans ADD COLUMN application_id uuid UNIQUE REFERENCES public.payg_applications(id);
CREATE TABLE public.payg_review_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL, entity_id uuid NOT NULL, action text NOT NULL, note text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT ON public.payg_review_events TO authenticated;
GRANT ALL ON public.payg_review_events TO service_role;
ALTER TABLE public.payg_review_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY payg_review_admin_read ON public.payg_review_events FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE POLICY payg_review_admin_insert ON public.payg_review_events FOR INSERT TO authenticated WITH CHECK(actor_id=auth.uid() AND public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.review_payg_application(p_id uuid,p_status text,p_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE a public.payg_applications; t jsonb; BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin required'; END IF;
 IF p_status NOT IN ('approved','declined') OR char_length(p_note)>1000 THEN RAISE EXCEPTION 'Invalid review'; END IF;
 SELECT * INTO a FROM public.payg_applications WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR a.status<>'pending' THEN RAISE EXCEPTION 'Application already reviewed'; END IF;
 IF p_status='approved' THEN
  PERFORM 1 FROM public.payg_products WHERE id=a.product_id AND approval_status='approved' AND is_active AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product is not approved'; END IF;
  t:=a.terms;
  INSERT INTO public.payg_plans(resident_id,vendor_id,product_id,product_name,down_payment_cents,instalment_cents,instalment_count,frequency,total_cents,application_id) VALUES(a.resident_id,a.vendor_id,a.product_id,a.product_name,(t->>'down_payment_cents')::bigint,(t->>'instalment_cents')::bigint,(t->>'instalment_count')::integer,t->>'frequency',(t->>'total_cents')::bigint,a.id);
 END IF;
 UPDATE public.payg_applications SET status=p_status,review_note=p_note,reviewed_by=auth.uid(),reviewed_at=now() WHERE id=a.id;
 INSERT INTO public.payg_review_events(actor_id,entity_id,action,note) VALUES(auth.uid(),a.id,p_status,p_note);
 END $$;
REVOKE ALL ON FUNCTION public.review_payg_application(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_payg_application(uuid,text,text) TO authenticated;
CREATE FUNCTION public.guard_payg_charge_approval() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.payg_plans p JOIN public.payg_applications a ON a.id=p.application_id JOIN public.payment_method_configurations c ON c.id=NEW.config_id WHERE p.id=NEW.plan_id AND p.resident_id=NEW.resident_id AND a.status='approved' AND c.owner_id=p.vendor_id AND c.enabled AND c.stk_enabled AND c.environment='production' AND c.country='KE' AND c.currency='KES') THEN RAISE EXCEPTION 'Approved application and vendor payment account required'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER payg_charge_approval BEFORE INSERT ON public.payg_payment_attempts FOR EACH ROW EXECUTE FUNCTION public.guard_payg_charge_approval();