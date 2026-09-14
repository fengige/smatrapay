
-- helper: meters owned by a vendor
CREATE OR REPLACE FUNCTION private.vendor_meter_ids(_vendor uuid)
RETURNS TABLE(meter_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT m.id FROM public.meters m WHERE m.vendor_id = _vendor::text $$;

DO $$ BEGIN
  CREATE TYPE public.service_request_status AS ENUM ('open','assigned','in_progress','resolved','closed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.service_priority AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.installation_assignment_status AS ENUM ('pending','scheduled','assigned','in_progress','completed','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. activation history -------------------------------------------------
CREATE TABLE public.meter_activation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  previous_status text,
  new_status text,
  reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.meter_activation_history TO authenticated;
GRANT ALL ON public.meter_activation_history TO service_role;
ALTER TABLE public.meter_activation_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view activation history" ON public.meter_activation_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Vendors view their activation history" ON public.meter_activation_history FOR SELECT TO authenticated USING (vendor_id = auth.uid());
CREATE POLICY "Vendors append activation history" ON public.meter_activation_history FOR INSERT TO authenticated WITH CHECK (vendor_id = auth.uid() AND actor_id = auth.uid() AND public.has_role(auth.uid(),'vendor'));

-- 2. meter readings ------------------------------------------------------
CREATE TABLE public.meter_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL,
  resident_id uuid,
  reading numeric NOT NULL,
  previous_reading numeric,
  consumption numeric,
  unit text NOT NULL DEFAULT 'kWh',
  reading_date date NOT NULL DEFAULT current_date,
  reading_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'recorded',
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meter_readings_meter_idx ON public.meter_readings(meter_id, reading_date DESC);
GRANT SELECT, INSERT ON public.meter_readings TO authenticated;
GRANT ALL ON public.meter_readings TO service_role;
ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage meter readings" ON public.meter_readings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Vendors view their meter readings" ON public.meter_readings FOR SELECT TO authenticated USING (vendor_id = auth.uid());
CREATE POLICY "Vendors add meter readings" ON public.meter_readings FOR INSERT TO authenticated WITH CHECK (
  vendor_id = auth.uid() AND recorded_by = auth.uid() AND public.has_role(auth.uid(),'vendor')
  AND meter_id IN (SELECT s.meter_id FROM private.vendor_meter_ids(auth.uid()) s(meter_id))
);

CREATE TABLE public.meter_reading_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_id uuid NOT NULL REFERENCES public.meter_readings(id) ON DELETE CASCADE,
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL,
  storage_path text NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.meter_reading_attachments TO authenticated;
GRANT ALL ON public.meter_reading_attachments TO service_role;
ALTER TABLE public.meter_reading_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view reading attachments" ON public.meter_reading_attachments FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Vendors view their reading attachments" ON public.meter_reading_attachments FOR SELECT TO authenticated USING (vendor_id = auth.uid());
CREATE POLICY "Vendors add reading attachments" ON public.meter_reading_attachments FOR INSERT TO authenticated WITH CHECK (
  vendor_id = auth.uid() AND uploaded_by = auth.uid()
  AND meter_id IN (SELECT s.meter_id FROM private.vendor_meter_ids(auth.uid()) s(meter_id))
);

-- 3. installation teams --------------------------------------------------
CREATE TABLE public.installation_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL,
  name text NOT NULL,
  leader_name text,
  phone text,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.installation_teams TO authenticated;
GRANT ALL ON public.installation_teams TO service_role;
ALTER TABLE public.installation_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage installation teams" ON public.installation_teams FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Vendors view their teams" ON public.installation_teams FOR SELECT TO authenticated USING (vendor_id = auth.uid());
CREATE POLICY "Vendors create their teams" ON public.installation_teams FOR INSERT TO authenticated WITH CHECK (vendor_id = auth.uid() AND public.has_role(auth.uid(),'vendor'));
CREATE POLICY "Vendors update their teams" ON public.installation_teams FOR UPDATE TO authenticated USING (vendor_id = auth.uid()) WITH CHECK (vendor_id = auth.uid());
CREATE TRIGGER installation_teams_set_updated_at BEFORE UPDATE ON public.installation_teams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.installation_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.installation_teams(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'installer',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.installation_team_members TO authenticated;
GRANT ALL ON public.installation_team_members TO service_role;
ALTER TABLE public.installation_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage team members" ON public.installation_team_members FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Vendors view their team members" ON public.installation_team_members FOR SELECT TO authenticated USING (vendor_id = auth.uid());
CREATE POLICY "Vendors create their team members" ON public.installation_team_members FOR INSERT TO authenticated WITH CHECK (vendor_id = auth.uid() AND public.has_role(auth.uid(),'vendor'));
CREATE POLICY "Vendors update their team members" ON public.installation_team_members FOR UPDATE TO authenticated USING (vendor_id = auth.uid()) WITH CHECK (vendor_id = auth.uid());
CREATE TRIGGER installation_team_members_set_updated_at BEFORE UPDATE ON public.installation_team_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. installation assignments -------------------------------------------
CREATE SEQUENCE public.installation_assignment_seq START 1000;
CREATE TABLE public.meter_installation_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_number text NOT NULL UNIQUE DEFAULT ('INS-' || lpad(nextval('public.installation_assignment_seq')::text, 6, '0')),
  vendor_id uuid NOT NULL,
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.installation_teams(id) ON DELETE SET NULL,
  resident_id uuid,
  zone_id integer REFERENCES public.zones(zone_id),
  scheduled_date date,
  scheduled_time text,
  location text,
  notes text,
  status public.installation_assignment_status NOT NULL DEFAULT 'scheduled',
  assigned_by uuid,
  completed_at timestamptz,
  completion_reading numeric,
  completion_notes text,
  installer_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT USAGE ON SEQUENCE public.installation_assignment_seq TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.meter_installation_assignments TO authenticated;
GRANT ALL ON public.meter_installation_assignments TO service_role;
ALTER TABLE public.meter_installation_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage installation assignments" ON public.meter_installation_assignments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Vendors view their installation assignments" ON public.meter_installation_assignments FOR SELECT TO authenticated USING (vendor_id = auth.uid());
CREATE POLICY "Vendors create installation assignments" ON public.meter_installation_assignments FOR INSERT TO authenticated WITH CHECK (
  vendor_id = auth.uid() AND public.has_role(auth.uid(),'vendor')
  AND meter_id IN (SELECT s.meter_id FROM private.vendor_meter_ids(auth.uid()) s(meter_id))
);
CREATE POLICY "Vendors update installation assignments" ON public.meter_installation_assignments FOR UPDATE TO authenticated USING (vendor_id = auth.uid()) WITH CHECK (vendor_id = auth.uid());
CREATE TRIGGER meter_installation_assignments_set_updated_at BEFORE UPDATE ON public.meter_installation_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.installation_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.meter_installation_assignments(id) ON DELETE CASCADE,
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'meter_photo',
  storage_path text NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.installation_attachments TO authenticated;
GRANT ALL ON public.installation_attachments TO service_role;
ALTER TABLE public.installation_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view installation attachments" ON public.installation_attachments FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Vendors view their installation attachments" ON public.installation_attachments FOR SELECT TO authenticated USING (vendor_id = auth.uid());
CREATE POLICY "Vendors add installation attachments" ON public.installation_attachments FOR INSERT TO authenticated WITH CHECK (
  vendor_id = auth.uid() AND uploaded_by = auth.uid()
  AND meter_id IN (SELECT s.meter_id FROM private.vendor_meter_ids(auth.uid()) s(meter_id))
);

-- 5. service requests -----------------------------------------------------
CREATE SEQUENCE public.service_request_seq START 1000;
CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE DEFAULT ('SR-' || lpad(nextval('public.service_request_seq')::text, 6, '0')),
  vendor_id uuid NOT NULL,
  meter_id uuid REFERENCES public.meters(id) ON DELETE SET NULL,
  resident_id uuid,
  zone_id integer REFERENCES public.zones(zone_id),
  issue_type text NOT NULL,
  priority public.service_priority NOT NULL DEFAULT 'medium',
  status public.service_request_status NOT NULL DEFAULT 'open',
  description text,
  preferred_date date,
  team_id uuid REFERENCES public.installation_teams(id) ON DELETE SET NULL,
  technician_id uuid REFERENCES public.installation_team_members(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  resolution text,
  work_performed text,
  parts_used text,
  meter_status_after text,
  final_reading numeric,
  resident_acknowledged boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT USAGE ON SEQUENCE public.service_request_seq TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.service_requests TO authenticated;
GRANT ALL ON public.service_requests TO service_role;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage service requests" ON public.service_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Vendors view their service requests" ON public.service_requests FOR SELECT TO authenticated USING (vendor_id = auth.uid());
CREATE POLICY "Vendors create service requests" ON public.service_requests FOR INSERT TO authenticated WITH CHECK (vendor_id = auth.uid() AND created_by = auth.uid() AND public.has_role(auth.uid(),'vendor'));
CREATE POLICY "Vendors update their service requests" ON public.service_requests FOR UPDATE TO authenticated USING (vendor_id = auth.uid()) WITH CHECK (vendor_id = auth.uid());
CREATE TRIGGER service_requests_set_updated_at BEFORE UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.service_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  note text,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.service_request_events TO authenticated;
GRANT ALL ON public.service_request_events TO service_role;
ALTER TABLE public.service_request_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view service request events" ON public.service_request_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Vendors view their service request events" ON public.service_request_events FOR SELECT TO authenticated USING (vendor_id = auth.uid());
CREATE POLICY "Vendors append service request events" ON public.service_request_events FOR INSERT TO authenticated WITH CHECK (vendor_id = auth.uid() AND actor_id = auth.uid());

-- 6. tokens & payments visibility for vendors -----------------------------
CREATE POLICY "Vendors view tokens for their meters" ON public.meter_tokens FOR SELECT TO authenticated USING (
  meter_id IN (SELECT s.meter_id FROM private.vendor_meter_ids(auth.uid()) s(meter_id))
);
CREATE POLICY "Vendors issue tokens for their meters" ON public.meter_tokens FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'vendor') AND issued_by = auth.uid()
  AND meter_id IN (SELECT s.meter_id FROM private.vendor_meter_ids(auth.uid()) s(meter_id))
);
CREATE POLICY "Vendors record resident payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'vendor') AND created_by = auth.uid()
  AND payee_id IN (SELECT s.user_id FROM private.vendor_scope_resident_ids(auth.uid()) s(user_id))
);
