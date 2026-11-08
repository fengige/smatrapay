import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listPortalPriceMeters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ portal: z.enum(["vendor", "landlord"]) }).parse(input))
  .handler(async ({ context, data }) => {
    const { readPriceMeters } = await import("./price-meter-scope.server");
    return { meters: await readPriceMeters(context.supabase, data.portal, context.userId) };
  });