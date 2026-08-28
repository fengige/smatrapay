ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS electricity_meter_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS water_meter_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS gas_meter_active boolean NOT NULL DEFAULT true;