REVOKE ALL ON public.vendor_applications, public.vendor_application_events, public.vendor_application_limits FROM anon,authenticated;
GRANT SELECT ON public.vendor_applications,public.vendor_application_events TO authenticated;
GRANT ALL ON public.vendor_applications,public.vendor_application_events,public.vendor_application_limits TO service_role;