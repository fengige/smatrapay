CREATE TABLE public.owner_property_commission_settings (
 owner_id uuid NOT NULL REFERENCES public.users(id),
 property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
 commission_payer text NOT NULL CHECK (commission_payer IN ('owner','resident')),
 commission_percentage numeric(5,2) NOT NULL CHECK (commission_percentage BETWEEN 0 AND 100),
 vat_on_commission_percentage numeric(5,2) NOT NULL CHECK (vat_on_commission_percentage BETWEEN 0 AND 100),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid,
 PRIMARY KEY (owner_id, property_id)
);
REVOKE ALL ON public.owner_property_commission_settings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.owner_property_commission_settings TO authenticated;
GRANT ALL ON public.owner_property_commission_settings TO service_role;
ALTER TABLE public.owner_property_commission_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin owner property commission access" ON public.owner_property_commission_settings FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
ALTER TABLE public.owner_commission_settings_history ADD COLUMN property_id uuid;
CREATE FUNCTION public.stamp_owner_property_commission_settings() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.property_id IS DISTINCT FROM OLD.property_id) THEN RAISE EXCEPTION 'Owner account and property cannot be changed'; END IF;
 NEW.updated_at:=clock_timestamp(); NEW.updated_by:=auth.uid(); RETURN NEW;
END $$;
CREATE TRIGGER stamp_owner_property_commission_settings BEFORE INSERT OR UPDATE ON public.owner_property_commission_settings FOR EACH ROW EXECUTE FUNCTION public.stamp_owner_property_commission_settings();
CREATE FUNCTION public.audit_owner_property_commission_settings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous jsonb; current_config jsonb;
BEGIN
 current_config:=jsonb_build_object('commission_payer',NEW.commission_payer,'commission_percentage',NEW.commission_percentage,'vat_on_commission_percentage',NEW.vat_on_commission_percentage);
 IF TG_OP='UPDATE' THEN previous:=jsonb_build_object('commission_payer',OLD.commission_payer,'commission_percentage',OLD.commission_percentage,'vat_on_commission_percentage',OLD.vat_on_commission_percentage); END IF;
 IF previous IS DISTINCT FROM current_config THEN INSERT INTO public.owner_commission_settings_history(owner_id,property_id,previous_configuration,new_configuration,changed_by) VALUES(NEW.owner_id,NEW.property_id,previous,current_config,auth.uid()); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_owner_property_commission_settings AFTER INSERT OR UPDATE ON public.owner_property_commission_settings FOR EACH ROW EXECUTE FUNCTION public.audit_owner_property_commission_settings();
ALTER PUBLICATION supabase_realtime ADD TABLE public.owner_property_commission_settings;
COMMENT ON TABLE public.owner_property_commission_settings IS 'Administrator property-specific owner commission overrides; take precedence over owner_commission_settings (all properties) for meters in that property.';