import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { landlordAccountTarget, landlordAccountPasswordInput } from "./landlord-account";

export const getVendorLandlordAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => landlordAccountTarget.parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { authorizeLandlordAccount, managedLandlordAccount } = await import("./landlord-account.server");
    const profile = await authorizeLandlordAccount(context.supabase, context.userId, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await managedLandlordAccount(supabaseAdmin, data.id);
    const history = await supabaseAdmin.from("user_audit_logs").select("created_at").eq("user_id", data.id).eq("action", "landlord_password_changed").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (history.error) throw new Error("Could not load account history.");
    return { ...profile, lastPasswordChange: history.data?.created_at ?? null };
  });

export const updateVendorLandlordPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => landlordAccountPasswordInput.parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { authorizeLandlordAccount, managedLandlordAccount, applyLandlordPassword } = await import("./landlord-account.server");
    await authorizeLandlordAccount(context.supabase, context.userId, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await managedLandlordAccount(supabaseAdmin, data.id);
    return applyLandlordPassword(supabaseAdmin, context.userId, data.id, data.password);
  });