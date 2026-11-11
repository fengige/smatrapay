ALTER TABLE public.owner_commission_settings ADD COLUMN owner_type text CHECK (owner_type IN ('landlord','vendor','agent'));
ALTER TABLE public.owner_commission_settings ADD COLUMN property_scope text NOT NULL DEFAULT 'all' CHECK (property_scope = 'all');
ALTER TABLE public.owner_property_commission_settings ADD COLUMN owner_type text CHECK (owner_type IN ('landlord','vendor','agent'));
ALTER TABLE public.owner_property_commission_settings ADD COLUMN property_scope text NOT NULL DEFAULT 'specific' CHECK (property_scope = 'specific');
CREATE FUNCTION public.owner_commission_linked_properties(p_owner uuid, p_type text) RETURNS SETOF public.properties LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT p.* FROM public.properties p WHERE public.has_role(auth.uid(),'admin') AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=p_owner AND r.role::text=p_type) AND (
 (p.landlord_id=p_owner AND coalesce(p.owner_type,'landlord')=p_type)
 OR EXISTS (SELECT 1 FROM public.units u JOIN public.meters m ON m.unit_id=u.id WHERE u.property_id=p.id AND coalesce(m.landlord_id,m.agent_id,CASE WHEN m.vendor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN m.vendor_id::uuid END)=p_owner AND CASE WHEN m.landlord_id IS NOT NULL THEN 'landlord' WHEN m.agent_id IS NOT NULL THEN 'agent' ELSE 'vendor' END=p_type)
 ); $$;
REVOKE ALL ON FUNCTION public.owner_commission_linked_properties(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_commission_linked_properties(uuid,text) TO authenticated,service_role;
CREATE FUNCTION public.guard_owner_commission_target() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.owner_type IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=NEW.owner_id AND role::text=NEW.owner_type) THEN RAISE EXCEPTION 'Select an account matching the owner type'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.owner_commission_linked_properties(NEW.owner_id,NEW.owner_type)) THEN RAISE EXCEPTION 'The selected owner has no linked properties'; END IF;
 IF TG_TABLE_NAME='owner_property_commission_settings' THEN
  IF NOT EXISTS(SELECT 1 FROM public.owner_commission_linked_properties(NEW.owner_id,NEW.owner_type) WHERE id=NEW.property_id) THEN RAISE EXCEPTION 'Select a property linked to this owner'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_owner_commission_target BEFORE INSERT OR UPDATE ON public.owner_commission_settings FOR EACH ROW EXECUTE FUNCTION public.guard_owner_commission_target();
CREATE TRIGGER guard_owner_property_commission_target BEFORE INSERT OR UPDATE ON public.owner_property_commission_settings FOR EACH ROW EXECUTE FUNCTION public.guard_owner_commission_target();
CREATE OR REPLACE FUNCTION public.audit_owner_commission_settings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous jsonb; current_config jsonb;
BEGIN
 current_config:=to_jsonb(NEW)-'updated_at'-'updated_by';
 IF TG_OP='UPDATE' THEN previous:=to_jsonb(OLD)-'updated_at'-'updated_by'; END IF;
 IF previous IS DISTINCT FROM current_config THEN INSERT INTO public.owner_commission_settings_history(owner_id,previous_configuration,new_configuration,changed_by) VALUES(NEW.owner_id,previous,current_config,auth.uid()); END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.audit_owner_property_commission_settings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous jsonb; current_config jsonb;
BEGIN
 current_config:=to_jsonb(NEW)-'updated_at'-'updated_by';
 IF TG_OP='UPDATE' THEN previous:=to_jsonb(OLD)-'updated_at'-'updated_by'; END IF;
 IF previous IS DISTINCT FROM current_config THEN INSERT INTO public.owner_commission_settings_history(owner_id,property_id,previous_configuration,new_configuration,changed_by) VALUES(NEW.owner_id,NEW.property_id,previous,current_config,auth.uid()); END IF;
 RETURN NEW;
END $$;
COMMENT ON FUNCTION public.owner_commission_linked_properties(uuid,text) IS 'Administrator-only owner target properties: explicit property ownership or actual meter ownership through units. Management vendor alone does not confer commission ownership.';