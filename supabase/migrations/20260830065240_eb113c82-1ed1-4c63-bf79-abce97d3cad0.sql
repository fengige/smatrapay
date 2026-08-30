CREATE OR REPLACE FUNCTION public.bulk_add_meters(p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SET search_path = public
AS $func$
  SELECT private.bulk_add_meters(p_payload);
$func$;

REVOKE ALL ON FUNCTION public.bulk_add_meters(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_add_meters(jsonb) TO authenticated;