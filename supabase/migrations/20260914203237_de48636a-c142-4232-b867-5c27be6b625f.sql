
-- 1. Installation tracking on meters
DO $$ BEGIN
  CREATE TYPE public.meter_installation_status AS ENUM ('not_installed','scheduled','installed','failed','replaced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.meters
  ADD COLUMN IF NOT EXISTS installation_status public.meter_installation_status NOT NULL DEFAULT 'not_installed',
  ADD COLUMN IF NOT EXISTS installation_date timestamptz,
  ADD COLUMN IF NOT EXISTS installer text,
  ADD COLUMN IF NOT EXISTS installation_location text,
  ADD COLUMN IF NOT EXISTS installation_notes text;

-- 2. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  resource_type text,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
CREATE POLICY "Users can view their notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Users can update their notifications" ON public.notifications;
CREATE POLICY "Users can update their notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Authenticated can create notifications" ON public.notifications;
CREATE POLICY "Authenticated can create notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

DROP TRIGGER IF EXISTS notifications_set_updated_at ON public.notifications;
CREATE TRIGGER notifications_set_updated_at BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Vendor audit log (insert only)
CREATE TABLE IF NOT EXISTS public.vendor_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_audit_logs_vendor_idx ON public.vendor_audit_logs (vendor_id, created_at DESC);

GRANT SELECT, INSERT ON public.vendor_audit_logs TO authenticated;
GRANT ALL ON public.vendor_audit_logs TO service_role;
ALTER TABLE public.vendor_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors and admins can view vendor audit logs" ON public.vendor_audit_logs;
CREATE POLICY "Vendors and admins can view vendor audit logs" ON public.vendor_audit_logs
  FOR SELECT TO authenticated USING (vendor_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Actors can append vendor audit logs" ON public.vendor_audit_logs;
CREATE POLICY "Actors can append vendor audit logs" ON public.vendor_audit_logs
  FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- 4. Vendor scope helpers
CREATE OR REPLACE FUNCTION private.vendor_unit_ids(_vendor uuid)
RETURNS TABLE (unit_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT m.unit_id FROM public.meters m
  WHERE m.vendor_id = _vendor::text AND m.unit_id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION private.vendor_property_ids(_vendor uuid)
RETURNS TABLE (property_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT u.property_id FROM public.units u
  WHERE u.id IN (SELECT unit_id FROM private.vendor_unit_ids(_vendor))
$$;

CREATE OR REPLACE FUNCTION private.vendor_zone_ids(_vendor uuid)
RETURNS TABLE (zone_id integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT p.zone_id FROM public.properties p
  WHERE p.zone_id IS NOT NULL
    AND p.id IN (SELECT property_id FROM private.vendor_property_ids(_vendor))
$$;

CREATE OR REPLACE FUNCTION private.vendor_resident_ids(_vendor uuid)
RETURNS TABLE (user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT a.user_id FROM public.unit_assignments a
  WHERE a.role = 'resident'
    AND a.unit_id IN (SELECT unit_id FROM private.vendor_unit_ids(_vendor))
$$;

CREATE OR REPLACE FUNCTION public.vendor_zone_ids(_vendor uuid)
RETURNS TABLE (zone_id integer) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT * FROM private.vendor_zone_ids(_vendor)
$$;

-- 5. Vendor access policies
DROP POLICY IF EXISTS "Vendors can view their meters" ON public.meters;
CREATE POLICY "Vendors can view their meters" ON public.meters
  FOR SELECT TO authenticated USING (vendor_id = auth.uid()::text);
DROP POLICY IF EXISTS "Vendors can insert their meters" ON public.meters;
CREATE POLICY "Vendors can insert their meters" ON public.meters
  FOR INSERT TO authenticated WITH CHECK (vendor_id = auth.uid()::text AND public.has_role(auth.uid(),'vendor'));
DROP POLICY IF EXISTS "Vendors can update their meters" ON public.meters;
CREATE POLICY "Vendors can update their meters" ON public.meters
  FOR UPDATE TO authenticated USING (vendor_id = auth.uid()::text AND public.has_role(auth.uid(),'vendor'))
  WITH CHECK (vendor_id = auth.uid()::text);

DROP POLICY IF EXISTS "Vendors can view their units" ON public.units;
CREATE POLICY "Vendors can view their units" ON public.units
  FOR SELECT TO authenticated USING (id IN (SELECT unit_id FROM private.vendor_unit_ids(auth.uid())));

DROP POLICY IF EXISTS "Vendors can view their properties" ON public.properties;
CREATE POLICY "Vendors can view their properties" ON public.properties
  FOR SELECT TO authenticated USING (id IN (SELECT property_id FROM private.vendor_property_ids(auth.uid())));

DROP POLICY IF EXISTS "Vendors can view their zones" ON public.zones;
CREATE POLICY "Vendors can view their zones" ON public.zones
  FOR SELECT TO authenticated USING (zone_id IN (SELECT zone_id FROM private.vendor_zone_ids(auth.uid())));

DROP POLICY IF EXISTS "Vendors can view their unit assignments" ON public.unit_assignments;
CREATE POLICY "Vendors can view their unit assignments" ON public.unit_assignments
  FOR SELECT TO authenticated USING (unit_id IN (SELECT unit_id FROM private.vendor_unit_ids(auth.uid())));

DROP POLICY IF EXISTS "Vendors can view their residents" ON public.users;
CREATE POLICY "Vendors can view their residents" ON public.users
  FOR SELECT TO authenticated USING (id IN (SELECT user_id FROM private.vendor_resident_ids(auth.uid())));

DROP POLICY IF EXISTS "Vendors can view their meter audit logs" ON public.meter_audit_logs;
CREATE POLICY "Vendors can view their meter audit logs" ON public.meter_audit_logs
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.meters m WHERE m.id = meter_audit_logs.meter_id AND m.vendor_id = auth.uid()::text
  ));

DROP POLICY IF EXISTS "Vendors can view resident payments" ON public.payments;
CREATE POLICY "Vendors can view resident payments" ON public.payments
  FOR SELECT TO authenticated USING (payee_id IN (SELECT user_id FROM private.vendor_resident_ids(auth.uid())));
