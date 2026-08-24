ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'resident';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'landlord';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agent';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'service_provider';