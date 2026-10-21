import { z } from "zod";

export const normalizeUsername = (value: string) => value.trim().toLowerCase();
export const residentUsername = z.string().trim().min(1, "Username is required").max(60)
  .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores")
  .transform(normalizeUsername);
export const residentCredentials = z.object({ username: residentUsername, password: z.string().min(1, "Password is required").max(256) });
export const GENERIC_LOGIN_ERROR = "Invalid username or password. Please try again.";
export const GENERIC_RESET_MESSAGE = "If an eligible account exists, a password reset link will be sent to its registered email address.";
export const hasRecoveryIntent = (hash: string, query: string) => new URLSearchParams(hash.replace(/^#/, "")).get("type") === "recovery" || new URLSearchParams(query).get("type") === "recovery";
export function trustedRecoveryUrl(origin: string | null | undefined) {
  const allowed = new Set(["https://apps.smatrapay.com", "https://smatrapay.lovable.app", "https://id-preview--120f9cd8-ee3d-469e-82d2-af8e1b8971ee.lovable.app", "http://localhost:8080"]);
  return `${origin && allowed.has(origin) ? origin : "https://apps.smatrapay.com"}/reset-password?type=recovery`;
}
export function verifiedRecoveryClaims(claims: { amr?: unknown }) {
  return Array.isArray(claims.amr) && claims.amr.some((entry: unknown) => typeof entry === "object" && entry !== null && "method" in entry && (entry.method === "otp" || entry.method === "recovery"));
}