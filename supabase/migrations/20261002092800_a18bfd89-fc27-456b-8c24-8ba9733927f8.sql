ALTER TABLE public.vendor_sms_configurations
  ADD COLUMN IF NOT EXISTS message_type smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS default_country_code text NOT NULL DEFAULT '254',
  ADD COLUMN IF NOT EXISTS delivery_receipt_callback_url text;
ALTER TABLE public.vendor_sms_configurations
  ADD CONSTRAINT vendor_sms_message_type_chk CHECK (message_type IN (1,2)),
  ADD CONSTRAINT vendor_sms_country_code_chk CHECK (default_country_code ~ '^[0-9]{1,4}$');

ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ref_id text,
  ADD COLUMN IF NOT EXISTS message_type smallint,
  ADD COLUMN IF NOT EXISTS cost text,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE UNIQUE INDEX IF NOT EXISTS sms_messages_ref_id_key ON public.sms_messages(ref_id) WHERE ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sms_messages_vendor_created_idx ON public.sms_messages(vendor_id, created_at DESC);