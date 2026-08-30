import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  userId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(20),
});

export type ProfileImageAuditEntry = {
  id: string;
  action: string;
  actor_name: string;
  created_at: string;
  from: string | null;
  to: string | null;
};

/** Profile photo upload/change/removal history for a single user. */
export const listProfileImageAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ entries: ProfileImageAuditEntry[] }> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("user_audit_logs")
      .select("id, action, changes, actor_id, created_at")
      .eq("user_id", data.userId)
      .like("action", "profile_image%")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const actorIds = [...new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean))] as string[];
    const actors = new Map<string, string>();
    if (actorIds.length) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", actorIds);
      for (const u of users ?? []) actors.set(u.id, u.name || u.email || "Unknown user");
    }

    const entries = (rows ?? []).map((r) => {
      const change = ((r.changes as Record<string, unknown> | null)?.["profile_image"] ??
        {}) as { from?: string | null; to?: string | null };
      return {
        id: r.id,
        action: r.action,
        actor_name: r.actor_id ? (actors.get(r.actor_id) ?? "Unknown user") : "System",
        created_at: r.created_at,
        from: change.from ?? null,
        to: change.to ?? null,
      };
    });

    return { entries };
  });
