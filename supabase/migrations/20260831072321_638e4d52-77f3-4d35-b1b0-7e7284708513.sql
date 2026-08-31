CREATE TABLE public.sms_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    configuration_id UUID REFERENCES public.sms_configurations(id) ON DELETE SET NULL,
    recipient_phone VARCHAR(30) NOT NULL,
    message TEXT NOT NULL,
    sender_id VARCHAR(50),
    provider_message_id VARCHAR(255),
    status VARCHAR(30) DEFAULT 'pending',
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_messages TO authenticated;
GRANT ALL ON public.sms_messages TO service_role;

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage SMS messages"
ON public.sms_messages
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));