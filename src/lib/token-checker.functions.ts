import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { publicMeterSchema } from "./meter-search";

export const verifyPublicMeter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => publicMeterSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { createCheckerClient, checkPublicMeter } = await import("./token-checker.server");
    const { phoneHash } = await import("./resident-phone");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Meter verification is unavailable. Please try again.");
    return checkPublicMeter(createCheckerClient(url, key), data, await phoneHash(getRequestHeader("cf-connecting-ip") ?? "unknown"));
  });

export const recentCheckedTokens = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => publicMeterSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { createCheckerClient, readCheckedTokens } = await import("./token-checker.server");
    const { phoneHash } = await import("./resident-phone");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Could not load recent tokens. Please try again.");
    return readCheckedTokens(createCheckerClient(url, key), data, await phoneHash(getRequestHeader("cf-connecting-ip") ?? "unknown"));
  });
