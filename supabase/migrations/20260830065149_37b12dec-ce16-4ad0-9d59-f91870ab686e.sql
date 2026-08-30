CREATE OR REPLACE FUNCTION public.bulk_add_meters(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_mode        text := lower(coalesce(p_payload->>'duplicate_mode', 'reject'));
  v_owner_type  text := lower(coalesce(p_payload->>'owner_type', ''));
  v_owner_id    uuid := (p_payload->>'owner_id')::uuid;
  v_supplier_id uuid := nullif(p_payload->>'supplier_id', '')::uuid;
  v_type        text := lower(coalesce(p_payload->>'type', 'electricity'));
  v_price       numeric := coalesce(nullif(p_payload->>'price_per_unit', '')::numeric, 0);
  v_initial     numeric := coalesce(nullif(p_payload->>'initial_reading', '')::numeric, 0);
  v_rows        jsonb := coalesce(p_payload->'rows', '[]'::jsonb);
  v_row         jsonb;
  v_i           int := 0;
  v_meter       text;
  v_serial      text;
  v_mkey        text;
  v_skey        text;
  v_match_meter uuid;
  v_match_serial uuid;
  v_target      uuid;
  v_seen_meters  text[] := '{}';
  v_seen_serials text[] := '{}';
  v_results     jsonb := '[]'::jsonb;
  v_created     int := 0;
  v_updated     int := 0;
  v_skipped     int := 0;
  v_failed      int := 0;
  v_errors      text := '';
  v_msg         text;
  v_status      text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF v_mode NOT IN ('reject', 'skip', 'update') THEN
    RAISE EXCEPTION 'Invalid duplicate mode: %', v_mode;
  END IF;
  IF v_owner_type NOT IN ('vendor', 'landlord', 'agent') THEN
    RAISE EXCEPTION 'Invalid owner type: %', v_owner_type;
  END IF;
  IF jsonb_typeof(v_rows) <> 'array' OR jsonb_array_length(v_rows) < 1 THEN
    RAISE EXCEPTION 'At least one meter row is required';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    v_i := v_i + 1;
    v_meter  := trim(coalesce(v_row->>'meter_number', ''));
    v_serial := trim(coalesce(nullif(v_row->>'serial_number', ''), v_meter || '-S'));
    v_mkey   := lower(v_meter);
    v_skey   := lower(v_serial);
    v_status := NULL;
    v_msg    := NULL;

    -- Validation (mirrors the app rules)
    IF v_meter = '' OR v_meter !~ '^[A-Za-z0-9][A-Za-z0-9/_-]*$' THEN
      v_status := 'failed';
      v_msg := 'Meter number is required and may only contain letters, numbers, - _ /';
    ELSIF v_mkey = v_skey THEN
      v_status := 'failed';
      v_msg := 'Meter number and serial number must be different';
    ELSIF length(v_serial) < 4 OR v_serial !~ '^[A-Za-z0-9][A-Za-z0-9/_-]*$' THEN
      v_status := 'failed';
      v_msg := 'Serial number may only contain letters, numbers, - _ / (min 4 characters)';
    ELSIF v_mkey = ANY (v_seen_meters) THEN
      v_status := 'failed';
      v_msg := 'Duplicate meter number within this batch';
    ELSIF v_skey = ANY (v_seen_serials) THEN
      v_status := 'failed';
      v_msg := 'Duplicate serial number within this batch';
    ELSE
      SELECT id INTO v_match_meter FROM public.meters WHERE lower(meter_number) = v_mkey LIMIT 1;
      SELECT id INTO v_match_serial FROM public.meters WHERE lower(serial_number) = v_skey LIMIT 1;

      IF v_match_meter IS NOT NULL OR v_match_serial IS NOT NULL THEN
        IF v_mode = 'reject' THEN
          v_status := 'failed';
          v_msg := CASE WHEN v_match_meter IS NOT NULL
                        THEN format('Meter number %s is already registered', v_meter)
                        ELSE format('Serial number %s is already registered', v_serial) END;
        ELSIF v_mode = 'skip' THEN
          v_seen_meters  := v_seen_meters  || v_mkey;
          v_seen_serials := v_seen_serials || v_skey;
          v_status := 'skipped';
          v_msg := 'Already registered — skipped';
          v_skipped := v_skipped + 1;
        ELSE -- update
          IF v_match_meter IS NOT NULL AND v_match_serial IS NOT NULL AND v_match_meter <> v_match_serial THEN
            v_status := 'failed';
            v_msg := 'Meter number and serial number match two different existing meters';
          ELSE
            v_target := coalesce(v_match_meter, v_match_serial);
            v_seen_meters  := v_seen_meters  || v_mkey;
            v_seen_serials := v_seen_serials || v_skey;
            UPDATE public.meters SET
              vendor_id       = v_owner_id::text,
              supplier_id     = v_supplier_id,
              landlord_id     = CASE WHEN v_owner_type = 'landlord' THEN v_owner_id ELSE NULL END,
              agent_id        = CASE WHEN v_owner_type = 'agent' THEN v_owner_id ELSE NULL END,
              meter_number    = v_meter,
              serial_number   = v_serial,
              type            = v_type,
              initial_reading = v_initial,
              price_per_unit  = v_price,
              sgc = nullif(v_row->>'sgc', '')::int,
              krn = nullif(v_row->>'krn', '')::int,
              ti  = nullif(v_row->>'ti', '')::int,
              ea  = nullif(v_row->>'ea', '')::int,
              ken = nullif(v_row->>'ken', '')::int
            WHERE id = v_target;
            v_status := 'updated';
            v_msg := 'Existing meter updated';
            v_updated := v_updated + 1;
          END IF;
        END IF;
      ELSE
        v_seen_meters  := v_seen_meters  || v_mkey;
        v_seen_serials := v_seen_serials || v_skey;
        INSERT INTO public.meters (
          vendor_id, supplier_id, landlord_id, agent_id, unit_id,
          meter_number, serial_number, type, initial_reading, price_per_unit,
          status, sgc, krn, ti, ea, ken
        ) VALUES (
          v_owner_id::text, v_supplier_id,
          CASE WHEN v_owner_type = 'landlord' THEN v_owner_id ELSE NULL END,
          CASE WHEN v_owner_type = 'agent' THEN v_owner_id ELSE NULL END,
          NULL,
          v_meter, v_serial, v_type, v_initial, v_price,
          'active',
          nullif(v_row->>'sgc', '')::int,
          nullif(v_row->>'krn', '')::int,
          nullif(v_row->>'ti', '')::int,
          nullif(v_row->>'ea', '')::int,
          nullif(v_row->>'ken', '')::int
        );
        v_status := 'created';
        v_msg := 'Created';
        v_created := v_created + 1;
      END IF;
    END IF;

    IF v_status = 'failed' THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || format('Row %s: %s', v_i, v_msg) || E'\n';
    END IF;

    v_results := v_results || jsonb_build_object(
      'row', v_i,
      'meter_number', v_meter,
      'serial_number', v_serial,
      'status', v_status,
      'message', v_msg
    );
  END LOOP;

  -- All-or-nothing: any failed row rolls back the entire transaction.
  IF v_failed > 0 THEN
    RAISE EXCEPTION '%', rtrim(v_errors, E'\n');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped,
    'failed', 0,
    'results', v_results
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.bulk_add_meters(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_add_meters(jsonb) TO authenticated;