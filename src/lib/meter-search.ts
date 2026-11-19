import { z } from "zod";

/** Vendor searches are case-insensitive and whitespace-trimmed. Public verification
 * uses the same normalization, but requires an exact number rather than discovery. */
export const normalizeMeterSearch = (value: string) => value.trim().toLowerCase();
export const publicMeterSchema = z.object({
  meter_number: z.string().trim().min(2, "Enter your full meter number.").max(64)
    .regex(/^[a-zA-Z0-9-]+$/, "Use only letters, numbers and hyphens.")
    .transform(normalizeMeterSearch),
});
export type CheckedMeter = { meter_number: string; type: string };
export type SafeToken = { date: string; amount: number; units: number; token: string | null; status: string };