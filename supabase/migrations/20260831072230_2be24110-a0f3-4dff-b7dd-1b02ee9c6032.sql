CREATE TABLE public.sms_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name VARCHAR(100) NOT NULL,
    provider_code VARCHAR(50) NOT NULL UNIQUE,
    api_url TEXT,
    api_key TEXT,
    api_secret TEXT,
    username VARCHAR(150),
    password TEXT,
    sender_id VARCHAR(50),
    account_id VARCHAR(150),
    client_id VARCHAR(150),
    is_active BOOLEAN DEFAULT FALSE,
    is_default BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_configurations TO authenticated;
GRANT ALL ON public.sms_configurations TO service_role;

ALTER TABLE public.sms_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage SMS configurations"
ON public.sms_configurations
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER sms_configurations_set_updated_at
BEFORE UPDATE ON public.sms_configurations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();