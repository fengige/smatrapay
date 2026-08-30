CREATE OR REPLACE FUNCTION private.apply_meter_assignment(
  p_holder text,
  p_holder_id uuid,
  p_meter_ids uuid[],
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_results jsonb := '[]'::jsonb;
  v_row record;
  v_reason text;
  v_ok boolean;
BEGIN
  IF p_holder NOT IN ('agent', 'vendor') THEN
    RAISE EXCEPTION 'Unsupported holder type: %', p_holder;
  END IF;
  IF p_action NOT IN ('assign', 'unassign') THEN
    RAISE EXCEPTION 'Unsupported action: %', p_action;
  END IF;
  IF v_actor IS NULL OR NOT private.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can change meter assignments';
  END IF;

  -- Serialize concurrent bulk assignment runs for this holder type.
  PERFORM pg_advisory_xact_lock(hashtext('meter_assignment_' || p_holder));

  FOR v_row IN
    SELECT m.id, m.meter_number, m.landlord_id, m.agent_id, m.vendor_id
    FROM public.meters m
    WHERE m.id = ANY(p_meter_ids)
    ORDER BY m.id
    FOR UPDATE
  LOOP
    v_reason := NULL;
    v_ok := false;

    IF p_action = 'assign' THEN
      IF p_holder = 'agent' THEN
        IF v_row.agent_id = p_holder_id THEN
          v_reason := 'Already registered to this agent';
        ELSIF v_row.agent_id IS NOT NULL THEN
          v_reason := 'Already registered to another agent';
        ELSIF v_row.landlord_id IS NOT NULL THEN
          v_reason := 'Already registered to a landlord';
        ELSIF v_row.vendor_id IS NOT NULL THEN
          v_reason := 'Already registered to a vendor';
        ELSE
          UPDATE public.meters SET agent_id = p_holder_id WHERE id = v_row.id;
          v_ok := true;
        END IF;
      ELSE
        IF v_row.vendor_id = p_holder_id THEN
          v_reason := 'Already registered to this vendor';
        ELSIF v_row.vendor_id IS NOT NULL THEN
          v_reason := 'Already registered to another vendor';
        ELSIF v_row.landlord_id IS NOT NULL THEN
          v_reason := 'Already registered to a landlord';
        ELSIF v_row.agent_id IS NOT NULL THEN
          v_reason := 'Already registered to an agent';
        ELSE
          UPDATE public.meters SET vendor_id = p_holder_id WHERE id = v_row.id;
          v_ok := true;
        END IF;
      END IF;
    ELSE
      IF p_holder = 'agent' THEN
        IF v_row.agent_id IS DISTINCT FROM p_holder_id THEN
          v_reason := COALESCE(
            CASE WHEN v_row.agent_id IS NOT NULL THEN 'Registered to a different agent' END,
            'Not registered to any agent'
          );
        ELSE
          UPDATE public.meters SET agent_id = NULL WHERE id = v_row.id;
          v_ok := true;
        END IF;
      ELSE
        IF v_row.vendor_id IS DISTINCT FROM p_holder_id THEN
          v_reason := COALESCE(
            CASE WHEN v_row.vendor_id IS NOT NULL THEN 'Registered to a different vendor' END,
            'Not registered to any vendor'
          );
        ELSE
          UPDATE public.meters SET vendor_id = NULL WHERE id = v_row.id;
          v_ok := true;
        END IF;
      END IF;
    END IF;

    v_results := v_results || jsonb_build_object(
      'id', v_row.id,
      'meter_number', v_row.meter_number,
      'ok', v_ok,
      'reason', v_reason
    );
  END LOOP;

  -- Report meters that no longer exist.
  v_results := v_results || COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', missing.id,
      'meter_number', missing.id::text,
      'ok', false,
      'reason', 'Meter no longer exists'
    ))
    FROM (
      SELECT unnest(p_meter_ids) AS id
      EXCEPT
      SELECT m.id FROM public.meters m WHERE m.id = ANY(p_meter_ids)
    ) AS missing
  ), '[]'::jsonb);

  RETURN jsonb_build_object('results', v_results);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_meter_assignment(
  p_holder text,
  p_holder_id uuid,
  p_meter_ids uuid[],
  p_action text
)
RETURNS jsonb
LANGUAGE sql
SET search_path = public
AS $$
  SELECT private.apply_meter_assignment(p_holder, p_holder_id, p_meter_ids, p_action);
$$;

REVOKE ALL ON FUNCTION public.apply_meter_assignment(text, uuid, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_meter_assignment(text, uuid, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_meter_assignment(text, uuid, uuid[], text) TO service_role;