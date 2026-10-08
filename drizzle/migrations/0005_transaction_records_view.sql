CREATE OR REPLACE VIEW public.transaction_records
WITH (security_invoker = true) AS
WITH owners AS (
  SELECT m.id AS meter_id, m.meter_number, m.price_per_unit,
    CASE WHEN m.landlord_id IS NOT NULL THEN m.landlord_id
         WHEN m.agent_id IS NOT NULL THEN m.agent_id
         WHEN m.vendor_id ~* '^[0-9a-f-]{36}$' THEN m.vendor_id::uuid END AS owner_id,
    CASE WHEN m.landlord_id IS NOT NULL THEN 'landlord'
         WHEN m.agent_id IS NOT NULL THEN 'agent'
         WHEN m.vendor_id ~* '^[0-9a-f-]{36}$' THEN 'vendor' END AS owner_type,
    m.vending_software_id
  FROM public.meters m
)
SELECT
  t.id AS record_id,
  t.id AS token_id,
  b.id AS bank_notification_id,
  t.created_at AS txn_at,
  b.bank,
  COALESCE(b.trans_id, t.reference) AS trans_id,
  t.meter_id,
  o.meter_number,
  o.owner_id,
  o.owner_type,
  u.name AS owner_name,
  t.amount AS amount_paid,
  t.commission_amount,
  t.vat_on_commission_amount,
  COALESCE(t.net_amount, t.amount) AS tokenizable_amount,
  t.units,
  o.price_per_unit AS tariff,
  vs.name AS vending_software,
  t.token,
  t.action::text AS action,
  CASE t.status::text WHEN 'issued' THEN 'generated' ELSE t.status::text END AS token_status,
  'completed'::text AS payment_status,
  lower(COALESCE(sl.status::text, b.sms_status, CASE WHEN t.sms_requested THEN 'not_sent' ELSE 'not_applicable' END)) AS sms_status,
  COALESCE(sl.phone, t.customer_phone, b.mobile) AS mobile,
  sl.created_at AS sms_at,
  t.provider_reference,
  b.error_message
FROM public.meter_tokens t
LEFT JOIN public.bank_notifications b ON b.token_id = t.id
LEFT JOIN owners o ON o.meter_id = t.meter_id
LEFT JOIN public.users u ON u.id = o.owner_id
LEFT JOIN public.vending_software vs ON vs.vending_software_id = t.vending_software_id
LEFT JOIN LATERAL (
  SELECT s.status, s.phone, s.created_at FROM public.token_sms_logs s
  WHERE s.token_id = t.id ORDER BY s.created_at DESC LIMIT 1
) sl ON true
UNION ALL
SELECT
  b.id, NULL::uuid, b.id, b.created_at, b.bank, b.trans_id,
  o.meter_id, COALESCE(b.meter_number, o.meter_number), o.owner_id, o.owner_type, u.name,
  b.trans_amount, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric,
  o.price_per_unit, vs.name, NULL::text, 'credit',
  CASE WHEN b.status IN ('failed', 'needs_review') THEN 'failed' ELSE 'pending' END,
  CASE WHEN b.status = 'processing' THEN 'processing' ELSE 'received' END,
  'not_applicable', b.mobile, NULL::timestamptz, NULL::text, b.error_message
FROM public.bank_notifications b
LEFT JOIN owners o ON o.meter_id = b.meter_id OR (b.meter_id IS NULL AND o.meter_number = b.meter_number)
LEFT JOIN public.users u ON u.id = o.owner_id
LEFT JOIN public.vending_software vs ON vs.vending_software_id = o.vending_software_id
WHERE b.token_id IS NULL;

GRANT SELECT ON public.transaction_records TO authenticated;
GRANT SELECT ON public.transaction_records TO service_role;

CREATE INDEX IF NOT EXISTS idx_meter_tokens_created_at ON public.meter_tokens (created_at);
CREATE INDEX IF NOT EXISTS idx_meter_tokens_status ON public.meter_tokens (status);
CREATE INDEX IF NOT EXISTS idx_bank_notifications_created_at ON public.bank_notifications (created_at);
CREATE INDEX IF NOT EXISTS idx_bank_notifications_token_id ON public.bank_notifications (token_id);
CREATE INDEX IF NOT EXISTS idx_bank_notifications_meter_number ON public.bank_notifications (meter_number);
CREATE INDEX IF NOT EXISTS idx_bank_notifications_trans_id ON public.bank_notifications (trans_id);
CREATE INDEX IF NOT EXISTS idx_bank_notifications_bank_status ON public.bank_notifications (bank, status);
CREATE INDEX IF NOT EXISTS idx_meters_meter_number ON public.meters (meter_number);
CREATE INDEX IF NOT EXISTS idx_meters_owner ON public.meters (landlord_id, agent_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_token_sms_logs_token_created ON public.token_sms_logs (token_id, created_at DESC);