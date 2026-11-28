CREATE OR REPLACE FUNCTION public.was_chat_member(p_conversation uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS(SELECT 1 FROM public.chat_participants WHERE conversation_id=p_conversation AND user_id=auth.uid() AND is_active) $$;
CREATE OR REPLACE FUNCTION public.chat_require_sender() RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text:=public.chat_role(auth.uid()); BEGIN
IF auth.uid() IS NULL OR v_role IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND status='active') THEN RAISE EXCEPTION 'Chat is not available for this account' USING ERRCODE='42501'; END IF;
IF EXISTS(SELECT 1 FROM public.chat_suspensions WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Your messaging access is suspended. Contact the administrator.' USING ERRCODE='42501'; END IF; RETURN v_role; END $$;
ALTER TABLE public.chat_participants ADD COLUMN viewing_until timestamptz;
CREATE OR REPLACE FUNCTION public.chat_attachment_allowed(p_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.chat_messages m WHERE m.attachment_path=p_path AND NOT m.is_deleted AND public.is_chat_member(m.conversation_id)) OR
(p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/' AND public.is_chat_member(split_part(p_path,'/',1)::uuid) AND split_part(p_path,'/',2)=auth.uid()::text)
$$;
REVOKE ALL ON FUNCTION public.chat_attachment_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_attachment_allowed(text) TO authenticated;
DROP POLICY "chat attachments member read" ON storage.objects;
CREATE POLICY "chat attachments member read" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='chat-attachments' AND public.chat_attachment_allowed(name));
CREATE OR REPLACE FUNCTION public.chat_validate_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE meta jsonb; BEGIN
IF TG_OP='INSERT' THEN
IF NEW.attachment_path IS NOT NULL THEN
SELECT metadata INTO meta FROM storage.objects WHERE bucket_id='chat-attachments' AND name=NEW.attachment_path;
IF meta IS NULL THEN RAISE EXCEPTION 'Attachment upload not found'; END IF;
NEW.attachment_size:=(meta->>'size')::bigint; NEW.attachment_type:=meta->>'mimetype';
IF NEW.attachment_size IS NULL OR NEW.attachment_size<1 OR NEW.attachment_size>20971520 THEN RAISE EXCEPTION 'Invalid attachment size'; END IF;
IF NOT (NEW.attachment_type LIKE 'image/%' OR NEW.attachment_type IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/csv','text/plain','application/zip')) THEN RAISE EXCEPTION 'Unsupported file type'; END IF;
NEW.message_type:=CASE WHEN NEW.attachment_type LIKE 'image/%' THEN 'image' ELSE 'document' END;
END IF;
ELSIF NEW.is_deleted AND NOT OLD.is_deleted THEN
INSERT INTO public.chat_audit_logs(actor_id,action,conversation_id,message_id,target_user_id,details) VALUES(auth.uid(),'deleted_content_preserved',OLD.conversation_id,OLD.id,OLD.sender_id,jsonb_build_object('message',OLD.message,'attachment_path',OLD.attachment_path,'attachment_name',OLD.attachment_name));
NEW.message:=NULL; NEW.attachment_path:=NULL; NEW.attachment_name:=NULL; NEW.attachment_size:=NULL; NEW.attachment_type:=NULL;
ELSIF NEW.is_edited AND NEW.message IS DISTINCT FROM OLD.message THEN
INSERT INTO public.chat_audit_logs(actor_id,action,conversation_id,message_id,details) VALUES(auth.uid(),'message_edited',OLD.conversation_id,OLD.id,jsonb_build_object('previous_message',OLD.message));
END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.chat_validate_message() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER chat_validate_message BEFORE INSERT OR UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.chat_validate_message();
-- Lock at the actor boundary so concurrent calls cannot bypass the message limit.
DO $$ DECLARE body text; BEGIN
SELECT pg_get_functiondef('public.send_chat_message(uuid,text,uuid,text,text,bigint,text,uuid)'::regprocedure) INTO body;
body:=replace(body,'PERFORM public.chat_require_sender();','PERFORM public.chat_require_sender(); PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 721));');
body:=replace(body,'left(coalesce(v_text, ''Sent an attachment''), 140)','''Open Instant Chat to read your new message.''');
body:=replace(body,'AND coalesce(s.notifications_enabled, true)','AND coalesce(s.notifications_enabled, true) AND (p.viewing_until IS NULL OR p.viewing_until < now())');
EXECUTE body;
SELECT pg_get_functiondef('public.start_private_chat(uuid)'::regprocedure) INTO body;
body:=replace(body,'SELECT id INTO v_id FROM public.chat_conversations WHERE private_key = v_key;', 'PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 722)); SELECT id INTO v_id FROM public.chat_conversations WHERE private_key = v_key;');
body:=replace(body,'v_key := least','IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_other AND status=''active'') THEN RAISE EXCEPTION ''This account is not active''; END IF; v_key := least');
EXECUTE body;
END $$;
CREATE OR REPLACE FUNCTION public.chat_viewing(p_conversation uuid, p_visible boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.is_chat_member(p_conversation) THEN RETURN; END IF;
UPDATE public.chat_participants SET viewing_until=CASE WHEN p_visible THEN now()+interval '45 seconds' ELSE NULL END WHERE conversation_id=p_conversation AND user_id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.chat_viewing(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chat_viewing(uuid,boolean) TO authenticated;
-- Restrict directory role lookup to current caller or authorized contacts.
REVOKE EXECUTE ON FUNCTION public.chat_role(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.chat_role(uuid) TO service_role;
-- Realtime policy uses a caller-bound helper, rather than unrestricted role lookup.
CREATE OR REPLACE FUNCTION public.chat_enabled() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.chat_role(auth.uid()) IS NOT NULL AND EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND status='active') $$;
REVOKE ALL ON FUNCTION public.chat_enabled() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chat_enabled() TO authenticated;
DROP POLICY "chat own topic read" ON realtime.messages;
DROP POLICY "chat typing presence send" ON realtime.messages;
CREATE POLICY "chat own topic read" ON realtime.messages FOR SELECT TO authenticated USING(public.chat_enabled() AND (realtime.topic()='chat:user:'||auth.uid()::text OR (realtime.topic() LIKE 'chat:conv:%' AND public.is_chat_member(nullif(substr(realtime.topic(),11),'')::uuid)) OR realtime.topic()='chat:presence'));
CREATE POLICY "chat typing presence send" ON realtime.messages FOR INSERT TO authenticated WITH CHECK(public.chat_enabled() AND ((realtime.topic() LIKE 'chat:conv:%' AND public.is_chat_member(nullif(substr(realtime.topic(),11),'')::uuid)) OR realtime.topic()='chat:presence'));