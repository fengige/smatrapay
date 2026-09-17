ALTER TABLE public.meter_supplier_api_settings
  ADD COLUMN IF NOT EXISTS vending_software_id uuid
  REFERENCES public.vending_software(vending_software_id) ON DELETE RESTRICT;

ALTER TABLE public.meter_supplier_api_settings
  DROP CONSTRAINT IF EXISTS meter_supplier_api_settings_meter_supplier_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS meter_supplier_api_settings_supplier_software_key
  ON public.meter_supplier_api_settings (meter_supplier_id, vending_software_id)
  WHERE vending_software_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS meter_supplier_api_settings_supplier_default_key
  ON public.meter_supplier_api_settings (meter_supplier_id)
  WHERE vending_software_id IS NULL;