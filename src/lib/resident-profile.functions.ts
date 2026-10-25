import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { auditFilters, imageMime, residentPersonalInput, residentSelfPassword, validOwnAvatar } from "./resident-profile";

export const getResidentProfile = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  setResponseHeader("Cache-Control", "no-store");
  const { ownResident } = await import("./resident-profile.server");
  const profile = await ownResident(context.supabase, context.userId);
  const { residentAvatarUrls } = await import("./resident-avatar.server");
  const photos = await residentAvatarUrls([profile], context.supabase);
  const photo = photos.get(profile.id) ?? null;
  return { ...profile, photo };
});

export const saveResidentPersonal = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => residentPersonalInput.parse(v)).handler(async ({ data, context }) => {
  const { ownResident, profileAudit } = await import("./resident-profile.server");
  await ownResident(context.supabase, context.userId);
  await profileAudit(context.userId, "profile_update", "attempt");
  const result = await context.supabase.from("users").update({ ...data, username: data.username || null, updated_by: context.userId }).eq("id", context.userId);
  if (result.error) { await profileAudit(context.userId, "profile_update", "failed"); throw new Error(result.error.code === "23505" ? "This username is already in use." : "Could not save your information."); }
  await profileAudit(context.userId, "profile_update", "success");
  return { ok: true };
});

export const saveResidentPhoto = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => { if (!(v instanceof FormData)) throw new Error("Choose a photo."); return v; }).handler(async ({ data, context }) => {
  const { ownResident, profileAudit } = await import("./resident-profile.server");
  const profile = await ownResident(context.supabase, context.userId);
  const file = data.get("photo");
  if (!(file instanceof File) || file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error("Choose a photo up to 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = imageMime(bytes);
  if (!mime || file.type !== mime) throw new Error("Choose a valid JPEG, PNG or WebP photo.");
  const path = `${context.userId}/profile/${crypto.randomUUID()}.${mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp"}`;
  const photoAction = profile.profile_image ? "photo_replace" : "photo_upload";
  const photoDetails = { had_previous_photo: Boolean(profile.profile_image), content_type: mime };
  await profileAudit(context.userId, photoAction, "attempt", photoDetails);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const upload = await supabaseAdmin.storage.from("avatars").upload(path, bytes, { contentType: mime, upsert: false });
  if (upload.error) { await profileAudit(context.userId, photoAction, "failed", photoDetails); throw new Error("Photo upload failed. Please try again."); }
  const result = await context.supabase.from("users").update({ profile_image: path, updated_by: context.userId }).eq("id", context.userId);
  if (result.error) { await context.supabase.storage.from("avatars").remove([path]); await profileAudit(context.userId, photoAction, "failed", photoDetails); throw new Error("Could not save the photo."); }
  if (profile.profile_image && validOwnAvatar(profile.profile_image, context.userId)) await context.supabase.storage.from("avatars").remove([profile.profile_image]);
  await profileAudit(context.userId, photoAction, "success", photoDetails);
  return { ok: true };
});

export const removeResidentPhoto = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { ownResident, profileAudit } = await import("./resident-profile.server");
  const profile = await ownResident(context.supabase, context.userId);
  await profileAudit(context.userId, "photo_remove", "attempt", { had_previous_photo: Boolean(profile.profile_image) });
  const result = await context.supabase.from("users").update({ profile_image: null, updated_by: context.userId }).eq("id", context.userId);
  if (result.error) { await profileAudit(context.userId, "photo_remove", "failed"); throw new Error("Could not remove the photo."); }
  if (profile.profile_image && validOwnAvatar(profile.profile_image, context.userId)) await context.supabase.storage.from("avatars").remove([profile.profile_image]);
  await profileAudit(context.userId, "photo_remove", "success"); return { ok: true };
});

export const changeResidentPassword = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => residentSelfPassword.parse(v)).handler(async ({ data, context }) => {
  const { ownResident, profileAudit } = await import("./resident-profile.server");
  await ownResident(context.supabase, context.userId);
  await profileAudit(context.userId, "password_change", "attempt");
  const url = process.env["SUPABASE_URL"]; const key = process.env["SUPABASE_PUBLISHABLE_KEY"]; const bearer = getRequestHeader("authorization");
  if (!url || !key || !bearer) throw new Error("Your session has expired. Sign in again.");
  const profile = await ownResident(context.supabase, context.userId);
  const verifier = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => { const headers = new Headers(init?.headers); if (headers.get("Authorization") === `Bearer ${key}` && key.startsWith("sb_")) headers.delete("Authorization"); headers.set("apikey", key); return fetch(input, { ...init, headers }); } } });
  const verified = await verifier.auth.signInWithPassword({ email: profile.email ?? "", password: data.current });
  if (verified.error || verified.data.user?.id !== context.userId) { await profileAudit(context.userId, "password_change", "failed"); throw new Error("Current password is incorrect. Use Forgot Password if needed."); }
  const response = await fetch(`${url}/auth/v1/user`, { method: "PUT", headers: { apikey: key, Authorization: bearer, "Content-Type": "application/json" }, body: JSON.stringify({ password: data.password, current_password: data.current }) });
  if (!response.ok) { await profileAudit(context.userId, "password_change", "failed"); throw new Error("Password change failed. Check your current password or use Forgot Password."); }
  await profileAudit(context.userId, "password_change", "success"); return { ok: true };
});

export const listResidentProfileAudit = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => auditFilters.parse(v)).handler(async ({ data, context }) => {
  const { ownResident } = await import("./resident-profile.server"); await ownResident(context.supabase, context.userId);
  let query = context.supabase.from("user_audit_logs").select("id,action,created_at,changes", { count: "exact" }).eq("user_id", context.userId);
  if (data.activity === "photo") query = query.or("action.like.resident_photo%,action.like.profile_image%");
  else if (data.activity !== "all") query = query.like("action", `%${data.activity}%`);
  if (data.status !== "all") query = query.contains("changes", { status: data.status });
  if (data.from) query = query.gte("created_at", `${data.from}T00:00:00Z`);
  if (data.to) query = query.lte("created_at", `${data.to}T23:59:59.999Z`);
  const result = await query.order("created_at", { ascending: false }).range(data.page * 20, data.page * 20 + 19);
  if (result.error) throw new Error("Could not load activity.");
  return { count: result.count ?? 0, rows: (result.data ?? []).map(row => ({ id: row.id, created_at: row.created_at, activity: row.action.replace(/^resident_/, "").replace(/_(success|failed|attempt)$/, "").replaceAll("_", " "), status: (row.changes as Record<string, unknown> )?.["status"] === "failed" ? "failed" : (row.changes as Record<string, unknown> )?.["status"] === "attempt" ? "attempt" : "success", description: "Account activity" })) };
});