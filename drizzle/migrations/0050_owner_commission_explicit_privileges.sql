REVOKE ALL ON public.owner_commission_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.owner_commission_settings TO authenticated;
GRANT ALL ON public.owner_commission_settings TO service_role;
REVOKE ALL ON public.owner_commission_settings_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.owner_commission_settings_history TO authenticated;
GRANT ALL ON public.owner_commission_settings_history TO service_role;