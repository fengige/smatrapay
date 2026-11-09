ALTER TABLE public.vending_commission_terms ADD COLUMN confirmed_vend_result jsonb;
GRANT UPDATE(confirmed_vend_result) ON public.vending_commission_terms TO service_role;
CREATE OR REPLACE FUNCTION public.preserve_vending_commission_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
IF (to_jsonb(NEW) - 'vend_state' - 'confirmed_vend_result') IS DISTINCT FROM (to_jsonb(OLD) - 'vend_state' - 'confirmed_vend_result') THEN RAISE EXCEPTION 'Purchase financial terms are immutable'; END IF;
IF OLD.confirmed_vend_result IS NOT NULL AND NEW.confirmed_vend_result IS DISTINCT FROM OLD.confirmed_vend_result THEN RAISE EXCEPTION 'Confirmed vending result is immutable'; END IF;
RETURN NEW; END $$;
CREATE TRIGGER preserve_vending_commission_snapshot BEFORE UPDATE ON public.vending_commission_terms FOR EACH ROW EXECUTE FUNCTION public.preserve_vending_commission_snapshot();
COMMENT ON COLUMN public.vending_commission_terms.confirmed_vend_result IS 'Service-only confirmed provider result, retained before token insertion so retries record the same token without calling the provider again.';