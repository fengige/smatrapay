ALTER TABLE public.resident_enquiries ADD COLUMN IF NOT EXISTS decided_by uuid;
ALTER TABLE public.resident_enquiries ADD COLUMN IF NOT EXISTS decided_at timestamptz;
ALTER TABLE public.resident_enquiries DROP CONSTRAINT IF EXISTS resident_enquiries_status_check;
ALTER TABLE public.resident_enquiries ADD CONSTRAINT resident_enquiries_status_check CHECK (status IN ('submitted','in_review','approved','declined','closed'));
COMMENT ON COLUMN public.resident_enquiries.decided_by IS 'Admin user who last changed the enquiry status';
COMMENT ON COLUMN public.resident_enquiries.decided_at IS 'When the enquiry status last changed';