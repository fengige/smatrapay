import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const roleValues = [
  "admin",
  "landlord",
  "vendor",
  "agent",
  "service_provider",
  "resident",
  "moderator",
  "user",
] as const;

const requiredRole = z.object({ role: z.enum(roleValues) });

/** Roles + profile for the signed-in user, read server-side with RLS. */
export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [rolesResult, profileResult] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("profiles")
        .select("id, name, email, phone, status, profile_image")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    if (rolesResult.error) throw new Error(rolesResult.error.message);

    return {
      userId,
      roles: (rolesResult.data ?? []).map((r) => r.role as string),
      profile: profileResult.data ?? null,
    };
  });

/** Backend verification that the signed-in user really holds the given role. */
export const checkRoleAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => requiredRole.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [rolesResult, profileResult] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("status").eq("id", userId).maybeSingle(),
    ]);
    if (rolesResult.error) throw new Error(rolesResult.error.message);

    const roles = (rolesResult.data ?? []).map((r) => r.role as string);
    const status = profileResult.data?.status ?? "active";

    if (status === "suspended" || status === "inactive") {
      return { allowed: false, roles, reason: "suspended" as const };
    }

    return {
      allowed: roles.includes(data.role),
      roles,
      reason: roles.includes(data.role) ? ("ok" as const) : ("wrong_portal" as const),
    };
  });
