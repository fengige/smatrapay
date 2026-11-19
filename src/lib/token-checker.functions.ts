import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicMeterSchema } from "./meter-search";

export const verifyPublicMeter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => publicMeterSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkPublicMeter } = await import("./token-checker.server");
    // Privileged lookup returns only number/type, never token history or resident identity.
    return checkPublicMeter(supabaseAdmin, data);
  });

export const recentCheckedTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => publicMeterSchema.parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readCheckedTokens } = await import("./token-checker.server");
    return readCheckedTokens(supabaseAdmin, context.userId, data);
  });