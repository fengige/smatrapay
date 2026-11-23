CREATE TABLE public.token_checker_limits (key text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL);
GRANT ALL ON public.token_checker_limits TO service_role;
ALTER TABLE public.token_checker_limits ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.public_token_checker(p_meter_number text, p_request_key text, p_history boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_number text := lower(btrim(p_meter_number));
  v_meter public.meters%ROWTYPE;
  v_count integer;
  v_key text;
  v_attempts integer;
  v_window timestamptz := date_trunc('minute', clock_timestamp());
  v_tokens jsonb := '[]'::jsonb;
  v_support jsonb;
BEGIN
  IF v_number IS NULL OR length(v_number) NOT BETWEEN 2 AND 64 OR v_number !~ '^[a-z0-9-]+$' OR p_request_key IS NULL OR p_request_key !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('error', 'Enter your full meter number.');
  END IF;
  FOREACH v_key IN ARRAY ARRAY['global', 'ip:' || p_request_key, 'meter:' || md5(v_number)] LOOP
    INSERT INTO public.token_checker_limits AS l(key, window_start, attempts) VALUES(v_key, v_window, 1)
    ON CONFLICT(key) DO UPDATE SET window_start = v_window, attempts = CASE WHEN l.window_start = v_window THEN l.attempts + 1 ELSE 1 END
    RETURNING attempts INTO v_attempts;
    IF v_attempts > (CASE WHEN v_key = 'global' THEN 1000 WHEN v_key LIKE 'ip:%' THEN 30 ELSE 20 END) THEN
      RETURN jsonb_build_object('error', 'Too many lookups. Please try again in a minute.');
    END IF;
  END LOOP;
  DELETE FROM public.token_checker_limits WHERE window_start < v_window - interval '1 day';
  SELECT jsonb_build_object('email', max(value) FILTER(WHERE key = 'app_support_email'), 'phone', max(value) FILTER(WHERE key = 'app_support_phone')) INTO v_support
    FROM public.app_settings WHERE key IN ('app_support_email', 'app_support_phone');
  SELECT count(*) INTO v_count FROM (SELECT 1 FROM public.meters WHERE lower(meter_number) = v_number LIMIT 2) m;
  IF v_count <> 1 THEN RETURN jsonb_build_object('meter', NULL, 'support', v_support, 'tokens', v_tokens); END IF;
  SELECT * INTO v_meter FROM public.meters WHERE lower(meter_number) = v_number LIMIT 1;
  IF p_history THEN
    SELECT coalesce(jsonb_agg(t.payload ORDER BY t.created_at DESC, t.id DESC), '[]'::jsonb) INTO v_tokens FROM (
      SELECT mt.created_at, mt.id, jsonb_build_object(
        'date', mt.created_at, 'property', p.name, 'unit', u.unit_number, 'meter', v_meter.meter_number,
        'token', CASE WHEN mt.status::text = 'issued' AND mt.expires_at >= now() THEN mt.token ELSE NULL END,
        'units', mt.units, 'amount', mt.amount, 'reference', coalesce(mt.reference, mt.provider_reference),
        'status', CASE WHEN mt.status::text = 'issued' AND mt.expires_at < now() THEN 'expired' ELSE mt.status::text END
      ) AS payload
      FROM public.meter_tokens mt LEFT JOIN public.units u ON u.id = v_meter.unit_id LEFT JOIN public.properties p ON p.id = u.property_id
      WHERE mt.meter_id = v_meter.id AND mt.action::text = 'credit'
      ORDER BY mt.created_at DESC, mt.id DESC LIMIT 3
    ) t;
  END IF;
  RETURN jsonb_build_object('meter', jsonb_build_object('meter_number', v_meter.meter_number, 'type', v_meter.type), 'support', v_support, 'tokens', v_tokens);
END;
$$;
REVOKE ALL ON FUNCTION public.public_token_checker(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_token_checker(text, text, boolean) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.public_token_checker(text, text, boolean) IS 'Explicit public exact-meter lookup: latest three credit transactions only, bounded lookup counters, no customer identity or general table access.';