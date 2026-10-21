import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const factor = z.object({ factorId: z.string().uuid() });
const codeInput = factor.extend({ code: z.string().regex(/^\d{6}$/, "Enter the six-digit authenticator code."), purpose: z.enum(["enable", "verify", "disable"]) });

export const residentMfa = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => z.discriminatedUnion("action", [z.object({ action: z.literal("status") }), z.object({ action: z.literal("enroll") }), factor.extend({ action: z.literal("cancel") }), codeInput.extend({ action: z.literal("verify") })]).parse(v)).handler(async ({ data, context }) => {
  setResponseHeader("Cache-Control", "no-store");
  const { ownResident, profileAudit } = await import("./resident-profile.server");
  await ownResident(context.supabase, context.userId);
  const url = process.env["SUPABASE_URL"]; const key = process.env["SUPABASE_PUBLISHABLE_KEY"]; const bearer = getRequestHeader("authorization");
  if (!url || !key || !bearer) throw new Error("Sign in again to manage account security.");
  const api = async (path: string, method: string, body?: unknown, authorization = bearer) => {
    const response = await fetch(`${url}/auth/v1${path}`, { method, headers: { apikey: key, Authorization: authorization, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("Account verification failed. Check the code and try again; authenticator enrollment may be unavailable.");
    return result;
  };
  const user = await api("/user", "GET");
  const factors = (user.factors ?? []).filter((f: { factor_type: string }) => f.factor_type === "totp") as { id: string; status: string; friendly_name?: string }[];
  if (data.action === "status") return { kind: "status" as const, factors: factors.map(f => ({ id: f.id, status: f.status, name: f.friendly_name ?? "Authenticator app" })), aal: context.claims.aal === "aal2" ? "aal2" : "aal1" };
  const operation = data.action === "enroll" ? "enroll" : data.action === "cancel" ? "cancel" : data.purpose;
  await profileAudit(context.userId, `mfa_${operation}`, "attempt");
  try {
    if (data.action === "enroll") {
      if (factors.some(f => f.status === "verified")) throw new Error("Two-factor authentication is already enabled.");
      for (const f of factors.filter(f => f.status !== "verified")) await api(`/factors/${f.id}`, "DELETE");
      const enrolled = await api("/factors", "POST", { factor_type: "totp", friendly_name: "SmatraPay authenticator", issuer: "SmatraPay" });
      return { kind: "enrollment" as const, id: String(enrolled.id), qr: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrolled.totp.qr_code)}`, secret: String(enrolled.totp.secret) };
    }
    const owned = factors.find(f => f.id === data.factorId);
    if (!owned) throw new Error("This authenticator does not belong to your account.");
    if (data.action === "cancel") {
      if (owned.status === "verified") throw new Error("Verify your authenticator before disabling it.");
      await api(`/factors/${owned.id}`, "DELETE");
      await profileAudit(context.userId, "mfa_cancel", "success"); return { kind: "cancelled" as const };
    }
    if ((data.purpose === "disable" || data.purpose === "verify") && owned.status !== "verified") throw new Error("Complete enrollment first.");
    const challenge = await api(`/factors/${owned.id}/challenge`, "POST", {});
    const verified = await api(`/factors/${owned.id}/verify`, "POST", { challenge_id: challenge.id, code: data.code });
    if (!verified.access_token || !verified.refresh_token) throw new Error("Verification did not complete.");
    if (data.purpose === "disable") await api(`/factors/${owned.id}`, "DELETE", undefined, `Bearer ${verified.access_token}`);
    await profileAudit(context.userId, `mfa_${data.purpose}`, "success");
    return { kind: "verified" as const, access_token: String(verified.access_token), refresh_token: String(verified.refresh_token) };
  } catch (error) {
    await profileAudit(context.userId, `mfa_${operation}`, "failed"); throw error;
  }
});