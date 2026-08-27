ALTER TABLE public.units
ADD COLUMN IF NOT EXISTS electricity_meter_no text,
ADD COLUMN IF NOT EXISTS water_meter_no text,
ADD COLUMN IF NOT EXISTS gas_meter_no text;