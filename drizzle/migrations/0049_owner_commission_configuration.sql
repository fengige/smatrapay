CREATE TABLE public.owner_commission_settings (
 owner_id uuid PRIMARY KEY REFERENCES public.users(id),
 commission_payer text NOT NULL CHECK (commission_payer IN ('owner','resident')),
 commission_percentage numeric(5,2) NOT NULL CHECK (commission_percentage BETWEEN 0 AND 100),
 vat_on_commission_percentage numeric(5,2) NOT NULL CHECK (vat_on_commission_percentage BETWEEN 0 AND 100),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.owner_commission_settings TO authenticated;
GRANT ALL ON public.owner_commission_settings TO service_role;
ALTER TABLE public.owner_commission_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin owner commission access" ON public.owner_commission_settings FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE TABLE public.owner_commission_settings_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.users(id),
 previous_configuration jsonb,
 new_configuration jsonb NOT NULL,
 changed_by uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.owner_commission_settings_history TO authenticated;
GRANT ALL ON public.owner_commission_settings_history TO service_role;
ALTER TABLE public.owner_commission_settings_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin owner commission history" ON public.owner_commission_settings_history FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE INDEX owner_commission_history_owner_time ON public.owner_commission_settings_history(owner_id,created_at DESC,id);
CREATE FUNCTION public.stamp_owner_commission_settings() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'Owner account cannot be changed'; END IF;
 NEW.updated_at:=clock_timestamp(); NEW.updated_by:=auth.uid(); RETURN NEW;
END $$;
CREATE TRIGGER stamp_owner_commission_settings BEFORE INSERT OR UPDATE ON public.owner_commission_settings FOR EACH ROW EXECUTE FUNCTION public.stamp_owner_commission_settings();
CREATE FUNCTION public.audit_owner_commission_settings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous jsonb; current_config jsonb;
BEGIN
 current_config:=jsonb_build_object('commission_payer',NEW.commission_payer,'commission_percentage',NEW.commission_percentage,'vat_on_commission_percentage',NEW.vat_on_commission_percentage);
 IF TG_OP='UPDATE' THEN previous:=jsonb_build_object('commission_payer',OLD.commission_payer,'commission_percentage',OLD.commission_percentage,'vat_on_commission_percentage',OLD.vat_on_commission_percentage); END IF;
 IF previous IS DISTINCT FROM current_config THEN INSERT INTO public.owner_commission_settings_history(owner_id,previous_configuration,new_configuration,changed_by) VALUES(NEW.owner_id,previous,current_config,auth.uid()); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_owner_commission_settings AFTER INSERT OR UPDATE ON public.owner_commission_settings FOR EACH ROW EXECUTE FUNCTION public.audit_owner_commission_settings();
ALTER PUBLICATION supabase_realtime ADD TABLE public.owner_commission_settings;
COMMENT ON TABLE public.owner_commission_settings IS 'Administrator owner-scoped configuration for pricing table readback; does not replace vending calculation sources.';