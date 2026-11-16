import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { residentPhoneRequest, residentPhoneVerification } from "./resident-phone";

export const requestResidentPhoneOtp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => residentPhoneRequest.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requestResidentPhoneCode } = await import("./resident-phone.server");
    return requestResidentPhoneCode(supabaseAdmin, data.phone, getRequestHeader("cf-connecting-ip") ?? "shared-preview");
  });

export const verifyResidentPhoneOtp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => residentPhoneVerification.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    const url = process.env["SUPABASE_URL"]; const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Phone sign-in is temporarily unavailable.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyResidentPhoneCode, establishResidentPhoneSession } = await import("./resident-phone.server");
    return verifyResidentPhoneCode(supabaseAdmin, data.challenge, data.code, getRequestHeader("cf-connecting-ip") ?? "shared-preview", id => establishResidentPhoneSession(supabaseAdmin, id, url, key));
  });