-- lovable-cron-fallback-reviewed: existing 5-minute retry job already approved by the user; only its table reference changes
CREATE TABLE public.bank_notifications (LIKE public.ncba_notifications INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
ALTER TABLE public.bank_notifications
  ADD CONSTRAINT bank_notifications_meter_id_fkey FOREIGN KEY (meter_id) REFERENCES public.meters(id),
  ADD CONSTRAINT bank_notifications_token_id_fkey FOREIGN KEY (token_id) REFERENCES public.meter_tokens(id);
INSERT INTO public.bank_notifications SELECT * FROM public.ncba_notifications;
GRANT SELECT ON public.bank_notifications TO authenticated;
GRANT ALL ON public.bank_notifications TO service_role;
ALTER TABLE public.bank_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read bank notifications" ON public.bank_notifications FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER bank_notifications_set_updated_at BEFORE UPDATE ON public.bank_notifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
COMMENT ON TABLE public.ncba_notifications IS 'DEPRECATED: replaced by bank_notifications';
SELECT cron.schedule('ncba-retry-drain', '*/5 * * * *', $c$
  select net.http_post(
    url := 'https://project--120f9cd8-ee3d-469e-82d2-af8e1b8971ee.lovable.app/api/public/hooks/ncba-retry-drain',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.cron_settings where key = 'ncba_retry_drain_token')
    ),
    body := '{}'::jsonb
  ) where exists (
    select 1 from public.bank_notifications where status = 'retry_pending' and next_retry_at <= now()
    union all
    select 1 from public.ncba_notifications where status = 'retry_pending' and next_retry_at <= now()
  );
$c$);