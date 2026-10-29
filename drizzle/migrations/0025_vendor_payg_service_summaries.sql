CREATE TABLE public.payg_service_summaries (
  vendor_id uuid PRIMARY KEY,
  summary_text text NOT NULL CHECK (char_length(btrim(summary_text)) BETWEEN 1 AND 10000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payg_service_summaries TO authenticated;
GRANT ALL ON public.payg_service_summaries TO service_role;
ALTER TABLE public.payg_service_summaries ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.resident_can_read_payg_summary(p_vendor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'resident')
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND status = 'active')
    AND EXISTS (
      SELECT 1 FROM public.unit_assignments a
      JOIN public.meters m ON m.unit_id = a.unit_id
      WHERE a.user_id = auth.uid() AND a.role = 'resident'
        AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
        AND m.vendor_id = p_vendor::text
    );
$$;
REVOKE ALL ON FUNCTION public.resident_can_read_payg_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resident_can_read_payg_summary(uuid) TO authenticated;

CREATE POLICY "Vendors read own payg summary" ON public.payg_service_summaries
FOR SELECT TO authenticated USING (vendor_id = auth.uid() AND public.has_role(auth.uid(), 'vendor'));
CREATE POLICY "Vendors insert own payg summary" ON public.payg_service_summaries
FOR INSERT TO authenticated WITH CHECK (vendor_id = auth.uid() AND public.has_role(auth.uid(), 'vendor'));
CREATE POLICY "Vendors update own payg summary" ON public.payg_service_summaries
FOR UPDATE TO authenticated USING (vendor_id = auth.uid() AND public.has_role(auth.uid(), 'vendor'))
WITH CHECK (vendor_id = auth.uid() AND public.has_role(auth.uid(), 'vendor'));
CREATE POLICY "Residents read related payg summaries" ON public.payg_service_summaries
FOR SELECT TO authenticated USING (public.resident_can_read_payg_summary(vendor_id));
CREATE TRIGGER payg_summary_updated_at BEFORE UPDATE ON public.payg_service_summaries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();