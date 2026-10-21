import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { residentAccountPasswordInput, residentAccountTarget } from "./resident-account";

export const getResidentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => residentAccountTarget.parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { authorizeResidentAccount, managedResidentAccount } = await import("./resident-account.server");
    const profile = await authorizeResidentAccount(context.supabase, context.userId, data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await managedResidentAccount(supabaseAdmin, data.id);
    const history = await supabaseAdmin.from("user_audit_logs").select("created_at").eq("user_id", data.id).eq("action", "resident_password_changed").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (history.error) throw new Error("Could not load account history.");
    return { ...profile, lastPasswordChange: history.data?.created_at ?? null };
  });

export const updateResidentAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => residentAccountPasswordInput.parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { authorizeResidentAccount, managedResidentAccount, applyResidentPassword } = await import("./resident-account.server");
    await authorizeResidentAccount(context.supabase, context.userId, data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await managedResidentAccount(supabaseAdmin, data.id);
    return applyResidentPassword(supabaseAdmin, context.userId, data.id, data.password);
  });