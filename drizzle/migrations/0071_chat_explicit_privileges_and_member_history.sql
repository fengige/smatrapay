REVOKE ALL ON public.chat_conversations, public.chat_participants, public.chat_messages, public.chat_message_receipts, public.chat_user_settings, public.chat_suspensions, public.chat_reports, public.chat_audit_logs FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.chat_conversations, public.chat_participants, public.chat_messages, public.chat_message_receipts, public.chat_suspensions, public.chat_reports, public.chat_audit_logs FROM authenticated;
CREATE OR REPLACE FUNCTION public.chat_visible_message(p_conversation uuid,p_created timestamptz) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.chat_participants WHERE conversation_id=p_conversation AND user_id=auth.uid() AND is_active AND (cleared_at IS NULL OR p_created>cleared_at)) $$;
REVOKE ALL ON FUNCTION public.chat_visible_message(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chat_visible_message(uuid,timestamptz) TO authenticated;
DROP POLICY "chat members read messages" ON public.chat_messages;
CREATE POLICY "chat members read messages" ON public.chat_messages FOR SELECT TO authenticated USING(public.chat_visible_message(conversation_id,created_at) OR public.has_role(auth.uid(),'admin'));
DO $$ DECLARE body text; BEGIN
SELECT pg_get_functiondef('public.manage_group_member(uuid,uuid,text)'::regprocedure) INTO body;
body:=replace(body,'IF p_action = ''leave'' THEN','IF p_action = ''leave'' THEN IF EXISTS(SELECT 1 FROM public.chat_participants WHERE conversation_id=p_conversation AND user_id=auth.uid() AND role=''owner'') THEN RAISE EXCEPTION ''The group owner must keep membership''; END IF;');
body:=replace(body,'IF public.chat_role(p_user) IS NULL THEN','IF public.chat_role(p_user) IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_user AND status=''active'') THEN');
EXECUTE body;
SELECT pg_get_functiondef('public.create_group_chat(text,text,uuid[])'::regprocedure) INTO body;
body:=replace(body,'IF public.chat_role(m) IN (''vendor'',''landlord'',''admin'') AND m <> auth.uid() THEN','IF public.chat_role(m) IN (''vendor'',''landlord'',''admin'') AND m <> auth.uid() AND EXISTS(SELECT 1 FROM public.users WHERE id=m AND status=''active'') THEN');
EXECUTE body;
END $$;
CREATE OR REPLACE FUNCTION public.chat_private_context(p_conversation uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT jsonb_build_object('cleared_at',p.cleared_at,'viewing_until',p.viewing_until) FROM public.chat_participants p WHERE p.conversation_id=p_conversation AND p.user_id=auth.uid() AND p.is_active
$$;
REVOKE ALL ON FUNCTION public.chat_private_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chat_private_context(uuid) TO authenticated;