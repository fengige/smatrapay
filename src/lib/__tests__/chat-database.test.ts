import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
const connection=process.env['SUPABASE_DB_URL'];
const db=connection?postgres(connection,{max:1,prepare:false}):null;
// The supplied database connection may inspect schema but cannot impersonate managed Auth roles.
// Live authenticated RLS/send/receipt acceptance is exercised through the browser's actual session.
describe.skipIf(!db)('installed chat security rules',()=>{
 afterAll(async()=>{await db?.end();});
 async function definition(name:string){if(!db)throw new Error('Database connection required');const r=await db`SELECT pg_get_functiondef(${name}::regprocedure) AS definition`;return String(r[0]?.['definition']);}
 it('private chats permit only administrator↔vendor/landlord',async()=>{
  const d=await definition('public.start_private_chat(uuid)');
  expect(d).toContain("v_role = 'admin' AND v_other IN ('vendor','landlord')");
  expect(d).toContain("v_role IN ('vendor','landlord') AND v_other = 'admin'");
 });
 it('group creation requires an administrator and 1–500 invited members',async()=>{
  const d=await definition('public.create_group_chat(text,text,uuid[])');
  expect(d).toContain("public.chat_require_sender() <> 'admin'");expect(d).toContain('array_length(p_members,1) > 500');
 });
 it('messages require active membership, atomic throttling and max 30 per minute',async()=>{
  const d=await definition('public.send_chat_message(uuid,text,uuid,text,text,bigint,text,uuid)');
  expect(d).toContain('public.is_chat_member(p_conversation)');expect(d).toContain('pg_advisory_xact_lock');expect(d).toContain(">= 30");expect(d).toContain("interval '1 minute'");
 });
 it('only own messages may be edited',async()=>{
  const d=await definition('public.edit_chat_message(uuid,text)');expect(d).toContain('sender_id = auth.uid()');expect(d).toContain('NOT is_deleted');
 });
 it('read receipts are caller-bound and require membership',async()=>{
  const d=await definition('public.mark_chat_read(uuid)');expect(d).toContain('public.is_chat_member(p_conversation)');expect(d).toContain('r.user_id = auth.uid()');expect(d).toContain('read_at = now()');
 });
 it('removed members cannot read via membership helpers',async()=>{
  const d=await definition('public.was_chat_member(uuid)');expect(d).toContain('user_id=auth.uid() AND is_active');
 });
 it('suspended or inactive accounts cannot send',async()=>{
  const d=await definition('public.chat_require_sender()');expect(d).toContain("status='active'");expect(d).toContain('public.chat_suspensions');expect(d).toContain('user_id=auth.uid()');
 });
 it('stored attachment metadata enforces 20 MB and approved types',async()=>{
  const d=await definition('public.chat_validate_message()');expect(d).toContain('NEW.attachment_size>20971520');expect(d).toContain('FROM storage.objects');expect(d).toContain("'application/pdf'");expect(d).toContain('NEW.attachment_type:=meta');
 });
 it('deleted content is hidden from ordinary reads and preserved in administrator audits',async()=>{
  const d=await definition('public.chat_validate_message()');expect(d).toContain('deleted_content_preserved');expect(d).toContain('NEW.message:=NULL');expect(d).toContain('NEW.attachment_path:=NULL');
 });
 it('anonymous callers lack chat table and RPC privileges',async()=>{
  if(!db)throw new Error('Database connection required');
  for(const fn of ['start_private_chat(uuid)','send_chat_message(uuid,text,uuid,text,text,bigint,text,uuid)','chat_directory(text)','chat_admin_stats()'])expect((await db`SELECT has_function_privilege('anon',${'public.'+fn},'EXECUTE') AS allowed`)[0]?.['allowed']).toBe(false);
  expect((await db`SELECT has_table_privilege('anon','public.chat_messages','SELECT') AS allowed`)[0]?.['allowed']).toBe(false);
 });
 it('authenticated users cannot bypass checked actions by writing directly',async()=>{
  if(!db)throw new Error('Database connection required');for(const verb of ['INSERT','UPDATE','DELETE'])expect((await db`SELECT has_table_privilege('authenticated','public.chat_messages',${verb}) AS allowed`)[0]?.['allowed']).toBe(false);
 });
 it('all chat tables have row-level security enabled',async()=>{
  if(!db)throw new Error('Database connection required');const rows=await db`SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('chat_conversations','chat_participants','chat_messages','chat_message_receipts','chat_user_settings','chat_suspensions','chat_reports','chat_audit_logs')`;
  expect(rows).toHaveLength(8);for(const r of rows)expect(r['relrowsecurity']).toBe(true);
 });
});
