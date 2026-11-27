-- Instant chat module (admin <-> vendor/landlord, admin-created groups)
CREATE TABLE public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_type text NOT NULL CHECK (conversation_type IN ('private','group')),
  title text CHECK (title IS NULL OR char_length(title) <= 120),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  group_photo text,
  private_key text UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  is_archived boolean NOT NULL DEFAULT false
);
CREATE TABLE public.chat_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','moderator','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  manual_unread boolean NOT NULL DEFAULT false,
  cleared_at timestamptz,
  is_muted boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (conversation_id, user_id)
);
CREATE INDEX chat_participants_user_idx ON public.chat_participants(user_id) WHERE is_active;
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','document','system')),
  message text CHECK (message IS NULL OR char_length(message) <= 4000),
  attachment_path text,
  attachment_name text,
  attachment_size bigint,
  attachment_type text,
  reply_to_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  forwarded_from_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  is_edited boolean NOT NULL DEFAULT false,
  edited_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_conv_idx ON public.chat_messages(conversation_id, created_at DESC, id DESC);
CREATE INDEX chat_messages_sender_idx ON public.chat_messages(sender_id, created_at DESC);
CREATE TABLE public.chat_message_receipts (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  delivered_at timestamptz,
  read_at timestamptz,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX chat_receipts_user_idx ON public.chat_message_receipts(user_id) WHERE read_at IS NULL;
CREATE TABLE public.chat_user_settings (
  user_id uuid PRIMARY KEY,
  notifications_enabled boolean NOT NULL DEFAULT true,
  sound_enabled boolean NOT NULL DEFAULT true,
  browser_enabled boolean NOT NULL DEFAULT false,
  email_enabled boolean NOT NULL DEFAULT false,
  email_delay_minutes integer NOT NULL DEFAULT 30 CHECK (email_delay_minutes BETWEEN 5 AND 1440),
  quiet_start time,
  quiet_end time,
  last_seen_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.chat_suspensions (
  user_id uuid PRIMARY KEY,
  reason text NOT NULL,
  suspended_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.chat_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  reported_by uuid NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','actioned')),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, reported_by)
);
CREATE TABLE public.chat_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  conversation_id uuid,
  target_user_id uuid,
  message_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_audit_created_idx ON public.chat_audit_logs(created_at DESC);

GRANT SELECT ON public.chat_conversations, public.chat_participants, public.chat_messages,
  public.chat_message_receipts, public.chat_reports, public.chat_audit_logs, public.chat_suspensions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chat_user_settings TO authenticated;
GRANT ALL ON public.chat_conversations, public.chat_participants, public.chat_messages, public.chat_message_receipts,
  public.chat_user_settings, public.chat_suspensions, public.chat_reports, public.chat_audit_logs TO service_role;

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_suspensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_audit_logs ENABLE ROW LEVEL SECURITY;

-- Which chat role a user has; extend here to admit residents/agents/service providers later.
CREATE OR REPLACE FUNCTION public.chat_role(p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user AND role = 'admin') THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user AND role = 'vendor') THEN 'vendor'
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user AND role = 'landlord') THEN 'landlord'
  END
$$;
CREATE OR REPLACE FUNCTION public.is_chat_member(p_conversation uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_participants
    WHERE conversation_id = p_conversation AND user_id = auth.uid() AND is_active)
$$;
CREATE OR REPLACE FUNCTION public.was_chat_member(p_conversation uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_participants
    WHERE conversation_id = p_conversation AND user_id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.chat_role(uuid), public.is_chat_member(uuid), public.was_chat_member(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.chat_role(uuid), public.is_chat_member(uuid), public.was_chat_member(uuid) TO authenticated;

-- Members (current or former, for history) and administrators (oversight) can read.
CREATE POLICY "chat members read conversations" ON public.chat_conversations FOR SELECT TO authenticated
  USING (public.was_chat_member(id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "chat members read participants" ON public.chat_participants FOR SELECT TO authenticated
  USING (public.was_chat_member(conversation_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "chat members read messages" ON public.chat_messages FOR SELECT TO authenticated
  USING (public.was_chat_member(conversation_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "chat members read receipts" ON public.chat_message_receipts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = message_id
    AND (public.was_chat_member(m.conversation_id) OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "own chat settings read" ON public.chat_user_settings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own chat settings insert" ON public.chat_user_settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own chat settings update" ON public.chat_user_settings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "chat suspensions read" ON public.chat_suspensions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "chat reports read" ON public.chat_reports FOR SELECT TO authenticated
  USING (reported_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "chat audit admin read" ON public.chat_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Doorbell: ring each participant's private topic on chat changes.
CREATE OR REPLACE FUNCTION public.chat_ring(p_conversation uuid, p_event text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM public.chat_participants WHERE conversation_id = p_conversation LOOP
    PERFORM realtime.send(jsonb_build_object('conversation_id', p_conversation), p_event, 'chat:user:' || r.user_id::text, true);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.chat_ring(uuid, text) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.chat_message_ring() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN PERFORM public.chat_ring(NEW.conversation_id, 'message'); RETURN NEW; END $$;
CREATE TRIGGER chat_message_ring AFTER INSERT OR UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_message_ring();

CREATE POLICY "chat own topic read" ON realtime.messages FOR SELECT TO authenticated
  USING (realtime.topic() = 'chat:user:' || auth.uid()::text
    OR (realtime.topic() LIKE 'chat:conv:%' AND public.is_chat_member(nullif(substr(realtime.topic(), 11), '')::uuid))
    OR (realtime.topic() = 'chat:presence' AND public.chat_role(auth.uid()) IS NOT NULL));
CREATE POLICY "chat typing presence send" ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK ((realtime.topic() LIKE 'chat:conv:%' AND public.is_chat_member(nullif(substr(realtime.topic(), 11), '')::uuid))
    OR (realtime.topic() = 'chat:presence' AND public.chat_role(auth.uid()) IS NOT NULL));

CREATE OR REPLACE FUNCTION public.chat_require_sender() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text := public.chat_role(auth.uid());
BEGIN
  IF auth.uid() IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Chat is not available for this account' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.chat_suspensions WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Your messaging access is suspended. Contact the administrator.' USING ERRCODE = '42501'; END IF;
  RETURN v_role;
END $$;

-- People the caller may start a private chat with.
CREATE OR REPLACE FUNCTION public.chat_directory(p_search text DEFAULT '') RETURNS TABLE(id uuid, name text, email text, chat_role text, profile_image text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text := public.chat_role(auth.uid()); q text := '%' || coalesce(trim(p_search),'') || '%';
BEGIN
  IF v_role IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT u.id, coalesce(u.name, u.email, 'User'), CASE WHEN v_role = 'admin' THEN u.email END, public.chat_role(u.id), coalesce(u.profile_image_url, u.profile_image)
  FROM public.users u
  WHERE u.id <> auth.uid() AND u.status = 'active'
    AND (coalesce(u.name,'') ILIKE q OR coalesce(u.email,'') ILIKE q)
    AND CASE WHEN v_role = 'admin' THEN public.chat_role(u.id) IN ('vendor','landlord')
             ELSE public.chat_role(u.id) = 'admin' END
  ORDER BY 2 LIMIT 50;
END $$;

CREATE OR REPLACE FUNCTION public.start_private_chat(p_other uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text := public.chat_require_sender(); v_other text := public.chat_role(p_other); v_key text; v_id uuid;
BEGIN
  IF p_other IS NULL OR p_other = auth.uid() THEN RAISE EXCEPTION 'Choose someone to message'; END IF;
  IF NOT ((v_role = 'admin' AND v_other IN ('vendor','landlord')) OR (v_role IN ('vendor','landlord') AND v_other = 'admin')) THEN
    RAISE EXCEPTION 'You can only message the administrator' USING ERRCODE = '42501'; END IF;
  v_key := least(auth.uid()::text, p_other::text) || ':' || greatest(auth.uid()::text, p_other::text);
  SELECT id INTO v_id FROM public.chat_conversations WHERE private_key = v_key;
  IF v_id IS NULL THEN
    INSERT INTO public.chat_conversations(conversation_type, private_key, created_by) VALUES ('private', v_key, auth.uid())
      ON CONFLICT (private_key) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NULL THEN SELECT id INTO v_id FROM public.chat_conversations WHERE private_key = v_key; END IF;
    INSERT INTO public.chat_participants(conversation_id, user_id) VALUES (v_id, auth.uid()), (v_id, p_other)
      ON CONFLICT DO NOTHING;
    INSERT INTO public.chat_audit_logs(actor_id, action, conversation_id, target_user_id) VALUES (auth.uid(), 'private_started', v_id, p_other);
  END IF;
  UPDATE public.chat_participants SET is_archived = false WHERE conversation_id = v_id AND user_id = auth.uid();
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.create_group_chat(p_title text, p_description text, p_members uuid[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; m uuid;
BEGIN
  IF public.chat_require_sender() <> 'admin' THEN RAISE EXCEPTION 'Only administrators can create groups' USING ERRCODE = '42501'; END IF;
  IF char_length(trim(coalesce(p_title,''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Group name must be 2–120 characters'; END IF;
  IF coalesce(array_length(p_members,1),0) < 1 OR array_length(p_members,1) > 500 THEN RAISE EXCEPTION 'Add between 1 and 500 members'; END IF;
  INSERT INTO public.chat_conversations(conversation_type, title, description, created_by)
    VALUES ('group', trim(p_title), nullif(trim(coalesce(p_description,'')),''), auth.uid()) RETURNING id INTO v_id;
  INSERT INTO public.chat_participants(conversation_id, user_id, role) VALUES (v_id, auth.uid(), 'owner');
  FOREACH m IN ARRAY p_members LOOP
    IF public.chat_role(m) IN ('vendor','landlord','admin') AND m <> auth.uid() THEN
      INSERT INTO public.chat_participants(conversation_id, user_id) VALUES (v_id, m) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  INSERT INTO public.chat_messages(conversation_id, sender_id, message_type, message) VALUES (v_id, auth.uid(), 'system', 'Group created');
  INSERT INTO public.chat_audit_logs(actor_id, action, conversation_id, details) VALUES (auth.uid(), 'group_created', v_id, jsonb_build_object('members', p_members));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_group_chat(p_conversation uuid, p_title text, p_description text, p_photo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.chat_require_sender();
  IF NOT (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.chat_participants WHERE conversation_id = p_conversation AND user_id = auth.uid() AND is_active AND role IN ('owner','moderator'))) THEN
    RAISE EXCEPTION 'Only group admins can change the group' USING ERRCODE = '42501'; END IF;
  IF p_photo IS NOT NULL AND p_photo NOT LIKE p_conversation::text || '/%' THEN RAISE EXCEPTION 'Invalid group photo'; END IF;
  UPDATE public.chat_conversations SET title = coalesce(nullif(trim(p_title),''), title), description = nullif(trim(coalesce(p_description,'')),''),
    group_photo = coalesce(p_photo, group_photo), updated_at = now()
    WHERE id = p_conversation AND conversation_type = 'group';
  INSERT INTO public.chat_audit_logs(actor_id, action, conversation_id) VALUES (auth.uid(), 'group_updated', p_conversation);
  PERFORM public.chat_ring(p_conversation, 'conversation');
END $$;

CREATE OR REPLACE FUNCTION public.manage_group_member(p_conversation uuid, p_user uuid, p_action text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  PERFORM public.chat_require_sender();
  IF NOT EXISTS (SELECT 1 FROM public.chat_conversations WHERE id = p_conversation AND conversation_type = 'group') THEN RAISE EXCEPTION 'Group not found'; END IF;
  IF p_action = 'leave' THEN
    UPDATE public.chat_participants SET is_active = false WHERE conversation_id = p_conversation AND user_id = auth.uid();
    p_user := auth.uid();
  ELSE
    IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only administrators can manage members' USING ERRCODE = '42501'; END IF;
    IF p_action = 'add' THEN
      IF public.chat_role(p_user) IS NULL THEN RAISE EXCEPTION 'This person cannot use chat'; END IF;
      INSERT INTO public.chat_participants(conversation_id, user_id) VALUES (p_conversation, p_user)
        ON CONFLICT (conversation_id, user_id) DO UPDATE SET is_active = true, joined_at = now();
    ELSIF p_action = 'remove' THEN
      UPDATE public.chat_participants SET is_active = false WHERE conversation_id = p_conversation AND user_id = p_user;
    ELSIF p_action IN ('moderator','member') THEN
      UPDATE public.chat_participants SET role = p_action WHERE conversation_id = p_conversation AND user_id = p_user AND role <> 'owner';
    ELSE RAISE EXCEPTION 'Unknown action'; END IF;
  END IF;
  SELECT coalesce(name, email, 'A member') INTO v_name FROM public.users WHERE id = p_user;
  INSERT INTO public.chat_messages(conversation_id, sender_id, message_type, message) VALUES (p_conversation, auth.uid(), 'system',
    v_name || CASE p_action WHEN 'add' THEN ' was added' WHEN 'remove' THEN ' was removed' WHEN 'leave' THEN ' left the group'
      WHEN 'moderator' THEN ' is now a group admin' ELSE ' is now a member' END);
  INSERT INTO public.chat_audit_logs(actor_id, action, conversation_id, target_user_id) VALUES (auth.uid(), 'member_' || p_action, p_conversation, p_user);
END $$;

CREATE OR REPLACE FUNCTION public.send_chat_message(p_conversation uuid, p_message text, p_reply_to uuid DEFAULT NULL,
  p_attachment_path text DEFAULT NULL, p_attachment_name text DEFAULT NULL, p_attachment_size bigint DEFAULT NULL,
  p_attachment_type text DEFAULT NULL, p_forward_from uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_text text := nullif(btrim(coalesce(p_message,'')), ''); v_type text := 'text';
  v_sender text; v_conv record; r record;
BEGIN
  PERFORM public.chat_require_sender();
  IF NOT public.is_chat_member(p_conversation) THEN RAISE EXCEPTION 'You are not part of this conversation' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM public.chat_messages WHERE sender_id = auth.uid() AND created_at > now() - interval '1 minute') >= 30 THEN
    RAISE EXCEPTION 'You are sending messages too quickly. Please wait a moment.'; END IF;
  IF p_forward_from IS NOT NULL THEN
    SELECT m.message, m.attachment_path, m.attachment_name, m.attachment_size, m.attachment_type INTO r
      FROM public.chat_messages m WHERE m.id = p_forward_from AND NOT m.is_deleted AND public.is_chat_member(m.conversation_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'Message cannot be forwarded'; END IF;
    v_text := coalesce(v_text, r.message); p_attachment_path := r.attachment_path; p_attachment_name := r.attachment_name;
    p_attachment_size := r.attachment_size; p_attachment_type := r.attachment_type;
  ELSIF p_attachment_path IS NOT NULL THEN
    IF p_attachment_path NOT LIKE p_conversation::text || '/' || auth.uid()::text || '/%' THEN RAISE EXCEPTION 'Invalid attachment'; END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'chat-attachments' AND name = p_attachment_path) THEN RAISE EXCEPTION 'Attachment upload not found'; END IF;
  END IF;
  IF p_attachment_path IS NOT NULL THEN
    v_type := CASE WHEN p_attachment_type LIKE 'image/%' THEN 'image' ELSE 'document' END;
  ELSIF v_text IS NULL THEN RAISE EXCEPTION 'Message cannot be empty'; END IF;
  IF p_reply_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.chat_messages WHERE id = p_reply_to AND conversation_id = p_conversation) THEN p_reply_to := NULL; END IF;
  INSERT INTO public.chat_messages(conversation_id, sender_id, message_type, message, reply_to_message_id, forwarded_from_message_id,
    attachment_path, attachment_name, attachment_size, attachment_type)
  VALUES (p_conversation, auth.uid(), v_type, v_text, p_reply_to, p_forward_from, p_attachment_path,
    left(p_attachment_name, 255), p_attachment_size, left(p_attachment_type, 120)) RETURNING id INTO v_id;
  INSERT INTO public.chat_message_receipts(message_id, user_id)
    SELECT v_id, user_id FROM public.chat_participants WHERE conversation_id = p_conversation AND is_active AND user_id <> auth.uid();
  UPDATE public.chat_conversations SET last_message_at = now() WHERE id = p_conversation;
  UPDATE public.chat_participants SET last_read_at = now(), manual_unread = false, is_archived = false
    WHERE conversation_id = p_conversation AND user_id = auth.uid();
  UPDATE public.chat_participants SET is_archived = false WHERE conversation_id = p_conversation AND is_active AND NOT is_muted;
  -- One unread in-app notification per conversation per recipient (no duplicates while unread).
  SELECT coalesce(name, email, 'Someone') INTO v_sender FROM public.users WHERE id = auth.uid();
  SELECT conversation_type, title INTO v_conv FROM public.chat_conversations WHERE id = p_conversation;
  INSERT INTO public.notifications(user_id, type, title, message, resource_type, resource_id, metadata)
  SELECT p.user_id, 'chat_message',
    CASE WHEN v_conv.conversation_type = 'group' THEN 'New message in ' || coalesce(v_conv.title,'group') ELSE 'New message from ' || v_sender END,
    left(coalesce(v_text, 'Sent an attachment'), 140), 'chat_conversation', p_conversation::text, jsonb_build_object('message_id', v_id)
  FROM public.chat_participants p
  LEFT JOIN public.chat_user_settings s ON s.user_id = p.user_id
  WHERE p.conversation_id = p_conversation AND p.is_active AND p.user_id <> auth.uid() AND NOT p.is_muted
    AND coalesce(s.notifications_enabled, true)
    AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = p.user_id AND n.type = 'chat_message'
      AND n.resource_id = p_conversation::text AND n.read_at IS NULL);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.edit_chat_message(p_message uuid, p_text text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.chat_require_sender();
  IF char_length(btrim(coalesce(p_text,''))) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Message must be 1–4000 characters'; END IF;
  UPDATE public.chat_messages SET message = btrim(p_text), is_edited = true, edited_at = now(), updated_at = now()
    WHERE id = p_message AND sender_id = auth.uid() AND NOT is_deleted AND message_type <> 'system' AND public.is_chat_member(conversation_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'You can only edit your own messages' USING ERRCODE = '42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.delete_chat_message(p_message uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conv uuid; v_sender uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT conversation_id, sender_id INTO v_conv, v_sender FROM public.chat_messages WHERE id = p_message AND NOT is_deleted;
  IF v_conv IS NULL OR NOT (v_sender = auth.uid() OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'You cannot delete this message' USING ERRCODE = '42501'; END IF;
  -- Soft delete keeps the record for audit; content is hidden from members.
  UPDATE public.chat_messages SET is_deleted = true, deleted_at = now(), updated_at = now() WHERE id = p_message;
  INSERT INTO public.chat_audit_logs(actor_id, action, conversation_id, message_id, target_user_id) VALUES (auth.uid(),
    CASE WHEN v_sender = auth.uid() THEN 'message_deleted' ELSE 'message_removed_by_admin' END, v_conv, p_message, v_sender);
END $$;

CREATE OR REPLACE FUNCTION public.mark_chat_read(p_conversation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_chat_member(p_conversation) THEN RETURN; END IF;
  UPDATE public.chat_participants SET last_read_at = now(), manual_unread = false WHERE conversation_id = p_conversation AND user_id = auth.uid();
  UPDATE public.chat_message_receipts r SET read_at = now(), delivered_at = coalesce(r.delivered_at, now())
    FROM public.chat_messages m WHERE m.id = r.message_id AND m.conversation_id = p_conversation AND r.user_id = auth.uid() AND r.read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.notifications SET read_at = now() WHERE user_id = auth.uid() AND type = 'chat_message' AND resource_id = p_conversation::text AND read_at IS NULL;
  IF v_count > 0 THEN PERFORM public.chat_ring(p_conversation, 'receipt'); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mark_chat_delivered() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  INSERT INTO public.chat_user_settings(user_id, last_seen_at) VALUES (auth.uid(), now())
    ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now();
  FOR c IN WITH upd AS (UPDATE public.chat_message_receipts r SET delivered_at = now()
      WHERE r.user_id = auth.uid() AND r.delivered_at IS NULL RETURNING r.message_id)
    SELECT DISTINCT m.conversation_id FROM upd JOIN public.chat_messages m ON m.id = upd.message_id LOOP
    PERFORM public.chat_ring(c, 'receipt');
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.set_chat_flags(p_conversation uuid, p_flag text, p_value boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.was_chat_member(p_conversation) THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  UPDATE public.chat_participants SET
    is_pinned = CASE WHEN p_flag = 'pinned' THEN p_value ELSE is_pinned END,
    is_muted = CASE WHEN p_flag = 'muted' THEN p_value ELSE is_muted END,
    is_archived = CASE WHEN p_flag = 'archived' THEN p_value ELSE is_archived END,
    manual_unread = CASE WHEN p_flag = 'unread' THEN p_value ELSE manual_unread END,
    cleared_at = CASE WHEN p_flag = 'cleared' AND p_value THEN now() ELSE cleared_at END
  WHERE conversation_id = p_conversation AND user_id = auth.uid();
  PERFORM realtime.send(jsonb_build_object('conversation_id', p_conversation), 'conversation', 'chat:user:' || auth.uid()::text, true);
END $$;

-- Conversation list with previews and unread counts for the caller.
CREATE OR REPLACE FUNCTION public.chat_conversation_list() RETURNS TABLE(
  id uuid, conversation_type text, title text, description text, group_photo text, last_message_at timestamptz,
  other_user_id uuid, other_name text, other_role text, other_photo text, other_last_seen timestamptz,
  last_message text, last_message_type text, last_sender_id uuid, last_is_deleted boolean,
  unread_count int, manual_unread boolean, is_pinned boolean, is_muted boolean, is_archived boolean, is_active boolean, member_count int, my_role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.conversation_type, c.title, c.description, c.group_photo, c.last_message_at,
    o.user_id, coalesce(ou.name, ou.email, 'User'), public.chat_role(o.user_id), coalesce(ou.profile_image_url, ou.profile_image), os.last_seen_at,
    CASE WHEN lm.is_deleted THEN NULL ELSE lm.message END, lm.message_type, lm.sender_id, lm.is_deleted,
    (SELECT count(*)::int FROM public.chat_messages m WHERE m.conversation_id = c.id AND m.sender_id <> auth.uid()
       AND m.message_type <> 'system' AND m.created_at > p.last_read_at AND NOT m.is_deleted),
    p.manual_unread, p.is_pinned, p.is_muted, p.is_archived, p.is_active,
    (SELECT count(*)::int FROM public.chat_participants x WHERE x.conversation_id = c.id AND x.is_active), p.role
  FROM public.chat_participants p
  JOIN public.chat_conversations c ON c.id = p.conversation_id
  LEFT JOIN LATERAL (SELECT x.user_id FROM public.chat_participants x WHERE c.conversation_type = 'private'
    AND x.conversation_id = c.id AND x.user_id <> auth.uid() LIMIT 1) o ON true
  LEFT JOIN public.users ou ON ou.id = o.user_id
  LEFT JOIN public.chat_user_settings os ON os.user_id = o.user_id
  LEFT JOIN LATERAL (SELECT m.message, m.message_type, m.sender_id, m.is_deleted FROM public.chat_messages m
    WHERE m.conversation_id = c.id AND (p.cleared_at IS NULL OR m.created_at > p.cleared_at)
    ORDER BY m.created_at DESC, m.id DESC LIMIT 1) lm ON true
  WHERE p.user_id = auth.uid()
  ORDER BY p.is_pinned DESC, c.last_message_at DESC
$$;

CREATE OR REPLACE FUNCTION public.chat_member_directory(p_conversation uuid) RETURNS TABLE(user_id uuid, name text, chat_role text, profile_image text, member_role text, is_active boolean, last_seen_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id, coalesce(u.name, u.email, 'User'), public.chat_role(p.user_id), coalesce(u.profile_image_url, u.profile_image), p.role, p.is_active, s.last_seen_at
  FROM public.chat_participants p LEFT JOIN public.users u ON u.id = p.user_id LEFT JOIN public.chat_user_settings s ON s.user_id = p.user_id
  WHERE p.conversation_id = p_conversation AND (public.was_chat_member(p_conversation) OR public.has_role(auth.uid(),'admin'))
  ORDER BY p.is_active DESC, 2
$$;

CREATE OR REPLACE FUNCTION public.chat_unread_total() RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum((SELECT count(*) FROM public.chat_messages m WHERE m.conversation_id = p.conversation_id AND m.sender_id <> auth.uid()
    AND m.message_type <> 'system' AND NOT m.is_deleted AND m.created_at > p.last_read_at) + CASE WHEN p.manual_unread THEN 1 ELSE 0 END), 0)::int
  FROM public.chat_participants p WHERE p.user_id = auth.uid() AND p.is_active AND NOT p.is_archived
$$;

CREATE OR REPLACE FUNCTION public.report_chat_message(p_message uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conv uuid;
BEGIN
  SELECT conversation_id INTO v_conv FROM public.chat_messages WHERE id = p_message AND sender_id <> auth.uid();
  IF v_conv IS NULL OR NOT public.is_chat_member(v_conv) THEN RAISE EXCEPTION 'You cannot report this message'; END IF;
  INSERT INTO public.chat_reports(message_id, reported_by, reason) VALUES (p_message, auth.uid(), btrim(p_reason))
    ON CONFLICT (message_id, reported_by) DO NOTHING;
  INSERT INTO public.chat_audit_logs(actor_id, action, conversation_id, message_id) VALUES (auth.uid(), 'message_reported', v_conv, p_message);
END $$;

CREATE OR REPLACE FUNCTION public.resolve_chat_report(p_report uuid, p_status text, p_note text, p_remove boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_msg uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrators only' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('dismissed','actioned') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.chat_reports SET status = p_status, resolved_by = auth.uid(), resolved_at = now(), resolution_note = left(p_note, 500)
    WHERE id = p_report RETURNING message_id INTO v_msg;
  IF v_msg IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF p_remove THEN PERFORM public.delete_chat_message(v_msg); END IF;
  INSERT INTO public.chat_audit_logs(actor_id, action, message_id, details) VALUES (auth.uid(), 'report_' || p_status, v_msg, jsonb_build_object('report', p_report));
END $$;

CREATE OR REPLACE FUNCTION public.set_chat_suspension(p_user uuid, p_suspend boolean, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrators only' USING ERRCODE = '42501'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'You cannot suspend yourself'; END IF;
  IF p_suspend THEN
    IF char_length(btrim(coalesce(p_reason,''))) < 3 THEN RAISE EXCEPTION 'Give a reason'; END IF;
    INSERT INTO public.chat_suspensions(user_id, reason, suspended_by) VALUES (p_user, btrim(p_reason), auth.uid())
      ON CONFLICT (user_id) DO UPDATE SET reason = excluded.reason, suspended_by = excluded.suspended_by, created_at = now();
  ELSE DELETE FROM public.chat_suspensions WHERE user_id = p_user; END IF;
  INSERT INTO public.chat_audit_logs(actor_id, action, target_user_id, details) VALUES (auth.uid(),
    CASE WHEN p_suspend THEN 'user_suspended' ELSE 'user_restored' END, p_user, jsonb_build_object('reason', p_reason));
END $$;

CREATE OR REPLACE FUNCTION public.chat_admin_stats() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrators only' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'conversations', (SELECT count(*) FROM public.chat_conversations),
    'messages', (SELECT count(*) FROM public.chat_messages WHERE message_type <> 'system'),
    'active_conversations', (SELECT count(*) FROM public.chat_conversations WHERE last_message_at > now() - interval '7 days'),
    'unread', (SELECT count(*) FROM public.chat_message_receipts WHERE read_at IS NULL),
    'vendors', (SELECT count(DISTINCT sender_id) FROM public.chat_messages WHERE public.chat_role(sender_id) = 'vendor'),
    'landlords', (SELECT count(DISTINCT sender_id) FROM public.chat_messages WHERE public.chat_role(sender_id) = 'landlord'),
    'groups', (SELECT count(*) FROM public.chat_conversations WHERE conversation_type = 'group'),
    'reports', (SELECT count(*) FROM public.chat_reports WHERE status = 'open'),
    'suspended', (SELECT count(*) FROM public.chat_suspensions));
END $$;

CREATE OR REPLACE FUNCTION public.chat_admin_conversations(p_type text DEFAULT 'all', p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL, p_status text DEFAULT 'all')
RETURNS TABLE(id uuid, conversation_type text, title text, members text, member_roles text[], message_count bigint, last_message_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrators only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT c.id, c.conversation_type, c.title,
    (SELECT string_agg(coalesce(u.name,u.email,'User'), ', ' ORDER BY u.name) FROM public.chat_participants p JOIN public.users u ON u.id = p.user_id WHERE p.conversation_id = c.id AND p.is_active),
    (SELECT array_agg(DISTINCT public.chat_role(p.user_id)) FROM public.chat_participants p WHERE p.conversation_id = c.id),
    (SELECT count(*) FROM public.chat_messages m WHERE m.conversation_id = c.id AND m.message_type <> 'system'),
    c.last_message_at, c.created_at
  FROM public.chat_conversations c
  WHERE (p_type = 'all' OR (p_type = 'group' AND c.conversation_type = 'group')
     OR (p_type IN ('vendor','landlord') AND c.conversation_type = 'private' AND EXISTS (SELECT 1 FROM public.chat_participants p WHERE p.conversation_id = c.id AND public.chat_role(p.user_id) = p_type)))
    AND (p_from IS NULL OR c.last_message_at >= p_from) AND (p_to IS NULL OR c.last_message_at < p_to)
    AND (p_status = 'all' OR (p_status = 'active' AND c.last_message_at > now() - interval '7 days') OR (p_status = 'inactive' AND c.last_message_at <= now() - interval '7 days'))
  ORDER BY c.last_message_at DESC LIMIT 500;
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['chat_require_sender()','chat_directory(text)','start_private_chat(uuid)','create_group_chat(text,text,uuid[])',
    'update_group_chat(uuid,text,text,text)','manage_group_member(uuid,uuid,text)','send_chat_message(uuid,text,uuid,text,text,bigint,text,uuid)',
    'edit_chat_message(uuid,text)','delete_chat_message(uuid)','mark_chat_read(uuid)','mark_chat_delivered()','set_chat_flags(uuid,text,boolean)',
    'chat_conversation_list()','chat_member_directory(uuid)','chat_unread_total()','report_chat_message(uuid,text)','resolve_chat_report(uuid,text,text,boolean)',
    'set_chat_suspension(uuid,boolean,text)','chat_admin_stats()','chat_admin_conversations(text,timestamptz,timestamptz,text)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon, public', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.chat_message_ring() FROM anon, authenticated, public;

-- Attachments: only members can read; members upload into <conversation>/<own id>/...
CREATE POLICY "chat attachments member read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments' AND (public.was_chat_member(((storage.foldername(name))[1])::uuid) OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "chat attachments member upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments' AND public.is_chat_member(((storage.foldername(name))[1])::uuid)
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND NOT EXISTS (SELECT 1 FROM public.chat_suspensions s WHERE s.user_id = auth.uid()));