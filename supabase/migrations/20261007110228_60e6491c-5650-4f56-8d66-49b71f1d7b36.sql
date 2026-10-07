ALTER TABLE public.ncba_notifications
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_by uuid;
CREATE INDEX IF NOT EXISTS ncba_notifications_retry_idx ON public.ncba_notifications (next_retry_at) WHERE status = 'retry_pending';