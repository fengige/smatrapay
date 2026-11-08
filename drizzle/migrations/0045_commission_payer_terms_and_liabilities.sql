ALTER TABLE public.pricing_settings ADD COLUMN commission_payer text NOT NULL DEFAULT 'resident' CHECK (commission_payer IN ('owner','resident'));
ALTER TABLE public.pricing_settings_history ADD COLUMN previous_payer text, ADD COLUMN new_payer text;
CREATE OR REPLACE FUNCTION public.log_pricing_settings_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 NEW.updated_at:=now(); NEW.updated_by:=auth.uid();
 IF NEW.commission_percentage IS DISTINCT FROM OLD.commission_percentage THEN INSERT INTO public.pricing_settings_history(field,previous_value,new_value,changed_by) VALUES('commission_percentage',OLD.commission_percentage,NEW.commission_percentage,auth.uid()); END IF;
 IF NEW.vat_on_commission_percentage IS DISTINCT FROM OLD.vat_on_commission_percentage THEN INSERT INTO public.pricing_settings_history(field,previous_value,new_value,changed_by) VALUES('vat_on_commission_percentage',OLD.vat_on_commission_percentage,NEW.vat_on_commission_percentage,auth.uid()); END IF;
 IF NEW.commission_payer IS DISTINCT FROM OLD.commission_payer THEN INSERT INTO public.pricing_settings_history(field,previous_payer,new_payer,changed_by) VALUES('commission_payer',OLD.commission_payer,NEW.commission_payer,auth.uid()); END IF;
 RETURN NEW; END $$;
CREATE TABLE public.vending_commission_terms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_key text NOT NULL UNIQUE, meter_id uuid NOT NULL REFERENCES public.meters(id),
 commission_payer text NOT NULL CHECK(commission_payer IN ('resident','owner')),
 gross_amount numeric NOT NULL CHECK(gross_amount>0), net_amount numeric NOT NULL CHECK(net_amount>0),
 commission_percentage numeric NOT NULL CHECK(commission_percentage BETWEEN 0 AND 100), commission_amount numeric NOT NULL CHECK(commission_amount>=0),
 vat_on_commission_percentage numeric NOT NULL CHECK(vat_on_commission_percentage BETWEEN 0 AND 100), vat_on_commission_amount numeric NOT NULL CHECK(vat_on_commission_amount>=0),
 price_per_unit numeric(15,2) NOT NULL, token_units numeric NOT NULL, vend_by_unit boolean NOT NULL,
 owner_id uuid, owner_type text, owner_name text, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(commission_payer<>'owner' OR (owner_id IS NOT NULL AND owner_type IS NOT NULL AND net_amount=gross_amount))
);
GRANT SELECT, INSERT ON public.vending_commission_terms TO service_role;
ALTER TABLE public.vending_commission_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_tokens ADD COLUMN commission_payer text NOT NULL DEFAULT 'resident' CHECK(commission_payer IN ('resident','owner')),
 ADD COLUMN commission_terms_id uuid REFERENCES public.vending_commission_terms(id), ADD COLUMN commission_owner_id uuid,
 ADD COLUMN commission_owner_type text, ADD COLUMN commission_owner_name text, ADD COLUMN applied_price_per_unit numeric(15,2);
CREATE TABLE public.owner_commission_liabilities (
 token_id uuid PRIMARY KEY REFERENCES public.meter_tokens(id), owner_id uuid NOT NULL, owner_type text NOT NULL,
 basis_amount numeric NOT NULL, commission_amount numeric NOT NULL, vat_on_commission_amount numeric NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.owner_commission_liabilities TO authenticated;
GRANT ALL ON public.owner_commission_liabilities TO service_role;
ALTER TABLE public.owner_commission_liabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own commission liability or admin" ON public.owner_commission_liabilities FOR SELECT TO authenticated USING(owner_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE VIEW public.owner_commission_balances WITH(security_invoker=true) AS SELECT owner_id,owner_type,sum(commission_amount) commission_liability,sum(vat_on_commission_amount) vat_liability,sum(commission_amount+vat_on_commission_amount) total_liability FROM public.owner_commission_liabilities GROUP BY owner_id,owner_type;
GRANT SELECT ON public.owner_commission_balances TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.enforce_token_commission_terms() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t public.vending_commission_terms; BEGIN
 IF TG_OP='UPDATE' THEN
 IF ROW(NEW.commission_payer,NEW.commission_terms_id,NEW.commission_owner_id,NEW.commission_owner_type,NEW.commission_owner_name,NEW.applied_price_per_unit,NEW.amount,NEW.net_amount,NEW.commission_percentage,NEW.commission_amount,NEW.vat_on_commission_percentage,NEW.vat_on_commission_amount) IS DISTINCT FROM ROW(OLD.commission_payer,OLD.commission_terms_id,OLD.commission_owner_id,OLD.commission_owner_type,OLD.commission_owner_name,OLD.applied_price_per_unit,OLD.amount,OLD.net_amount,OLD.commission_percentage,OLD.commission_amount,OLD.vat_on_commission_percentage,OLD.vat_on_commission_amount) THEN RAISE EXCEPTION 'Transaction financial terms are immutable'; END IF; RETURN NEW;
 END IF;
 IF NEW.commission_terms_id IS NULL THEN IF NEW.commission_payer='owner' THEN RAISE EXCEPTION 'Owner commission requires verified terms'; END IF; RETURN NEW; END IF;
 SELECT * INTO t FROM public.vending_commission_terms WHERE id=NEW.commission_terms_id;
 IF NOT FOUND OR t.meter_id<>NEW.meter_id OR NEW.action<>'credit' OR (NEW.idempotency_key IS NOT NULL AND NEW.idempotency_key<>t.request_key) THEN RAISE EXCEPTION 'Invalid transaction commission terms'; END IF;
 IF EXISTS(SELECT 1 FROM public.meter_tokens WHERE commission_terms_id=t.id) THEN RAISE EXCEPTION 'Commission terms already used'; END IF;
 NEW.commission_payer:=t.commission_payer; NEW.amount:=t.gross_amount;
 IF t.commission_payer='owner' THEN NEW.net_amount:=t.net_amount; END IF;
 NEW.commission_percentage:=t.commission_percentage; NEW.commission_amount:=t.commission_amount;
 NEW.vat_on_commission_percentage:=t.vat_on_commission_percentage; NEW.vat_on_commission_amount:=t.vat_on_commission_amount;
 NEW.commission_owner_id:=t.owner_id; NEW.commission_owner_type:=t.owner_type; NEW.commission_owner_name:=t.owner_name; NEW.applied_price_per_unit:=t.price_per_unit;
 RETURN NEW; END $$;
CREATE TRIGGER enforce_token_commission_terms BEFORE INSERT OR UPDATE ON public.meter_tokens FOR EACH ROW EXECUTE FUNCTION public.enforce_token_commission_terms();
CREATE UNIQUE INDEX meter_tokens_commission_terms_unique ON public.meter_tokens(commission_terms_id) WHERE commission_terms_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.post_owner_commission_liability() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.action='credit' AND NEW.commission_payer='owner' THEN INSERT INTO public.owner_commission_liabilities(token_id,owner_id,owner_type,basis_amount,commission_amount,vat_on_commission_amount) VALUES(NEW.id,NEW.commission_owner_id,NEW.commission_owner_type,NEW.amount,NEW.commission_amount,NEW.vat_on_commission_amount); END IF; RETURN NEW; END $$;
CREATE TRIGGER post_owner_commission_liability AFTER INSERT ON public.meter_tokens FOR EACH ROW EXECUTE FUNCTION public.post_owner_commission_liability();
COMMENT ON TABLE public.owner_commission_liabilities IS 'Confirmed token commission and VAT payable by the snapshotted owner; revocation is not a monetary refund and does not erase liability.';