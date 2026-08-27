import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const footerSchema = z.object({
  footer_copyright: z.string().trim().min(1, "Copyright text is required").max(200),
  footer_terms_url: z.string().trim().min(1, "Terms link is required").max(300),
  footer_privacy_url: z.string().trim().min(1, "Privacy link is required").max(300),
});

export type FooterSettings = z.infer<typeof footerSchema>;

export const FOOTER_DEFAULTS: FooterSettings = {
  footer_copyright: "Developed by Rezicom Technologies Limited. All rights reserved.",
  footer_terms_url: "/terms",
  footer_privacy_url: "/privacy",
};

export const updateFooterSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => footerSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin access required");

    const rows = (Object.keys(data) as (keyof FooterSettings)[]).map((key) => ({
      key,
      value: data[key],
      updated_at: new Date().toISOString(),
      updated_by: userId,
    }));

    const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);

    return data;
  });
