CREATE TYPE public.meter_utility_type AS ENUM ('Electricity', 'Water', 'Gas', 'Multi-Utility');

CREATE TYPE public.supplier_status AS ENUM ('Active', 'Inactive', 'Suspended');

CREATE TABLE public.meter_suppliers (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_name text NOT NULL,
    license_number text UNIQUE,
    utility_type public.meter_utility_type NOT NULL,
    contact_name text,
    email text UNIQUE,
    phone_number text,
    website_url text,
    status public.supplier_status NOT NULL DEFAULT 'Active',
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.meter_suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meter_suppliers TO authenticated;
GRANT ALL ON public.meter_suppliers TO service_role;

ALTER TABLE public.meter_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage meter suppliers"
ON public.meter_suppliers
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated users can view active meter suppliers"
ON public.meter_suppliers
FOR SELECT
TO authenticated
USING (status = 'Active');

CREATE TRIGGER meter_suppliers_set_updated_at
BEFORE UPDATE ON public.meter_suppliers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();