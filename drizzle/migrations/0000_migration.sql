ALTER TABLE public.ncba_notifications
  ADD COLUMN IF NOT EXISTS bank text NOT NULL DEFAULT 'NCBA',
  ADD COLUMN IF NOT EXISTS bank_reference text,
  ADD COLUMN IF NOT EXISTS payment_status text;
ALTER TABLE public.ncba_notifications DROP CONSTRAINT IF EXISTS ncba_notifications_trans_id_key;
DROP INDEX IF EXISTS public.ncba_notifications_trans_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS bank_notifications_bank_trans_id_key ON public.ncba_notifications (bank, trans_id);