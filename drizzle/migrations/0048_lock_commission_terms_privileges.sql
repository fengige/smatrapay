REVOKE ALL ON public.vending_commission_terms FROM anon, authenticated;
GRANT SELECT, INSERT ON public.vending_commission_terms TO service_role;
GRANT UPDATE(vend_state,confirmed_vend_result) ON public.vending_commission_terms TO service_role;
COMMENT ON TABLE public.vending_commission_terms IS 'Immutable purchase financial snapshots and confirmed provider recovery results. Service-role only; no browser or anonymous access.';