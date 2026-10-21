import { z } from "zod";

export const residentPersonalInput = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(120),
  username: z.string().trim().max(60).regex(/^[a-zA-Z0-9._-]*$/, "Use letters, numbers, dots, dashes or underscores").transform(v => v.toLowerCase()),
  phone: z.string().trim().max(20).regex(/^[+]?[0-9\s()-]*$/, "Enter a valid phone number."),
  address: z.string().trim().max(250),
  id_number: z.string().trim().max(60),
  bio: z.string().trim().max(1000),
}).strict();
export const residentSelfPassword = z.object({ current: z.string().min(1, "Enter your current password.").max(256), password: z.string().min(6, "At least 6 characters.").max(72), confirmation: z.string().min(1, "Confirm your new password.").max(72) }).refine(v => v.password === v.confirmation, { path: ["confirmation"], message: "Passwords do not match." });
export const auditFilters = z.object({ page: z.number().int().min(0).default(0), activity: z.enum(["all", "profile", "photo", "password", "mfa", "recovery"]).default("all"), status: z.enum(["all", "success", "failed", "attempt"]).default("all"), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default("") }).refine(v => !v.from || !v.to || v.from <= v.to, "End date must follow start date.");
export function imageMime(bytes: Uint8Array): string | null {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return "image/png";
  const text = (a:number,b:number) => String.fromCharCode(...bytes.slice(a,b));
  if (text(0,4) === "RIFF" && text(8,12) === "WEBP") return "image/webp";
  return null;
}
export function validOwnAvatar(path: string, id: string) { return path.startsWith(`${id}/profile/`) && !path.includes("..") && /\.(jpg|png|webp)$/.test(path); }
export function requiresSecondFactor(roles: string[], factors: { status: string }[], aal: unknown) { return roles.includes("resident") && factors.some(f => f.status === "verified") && aal !== "aal2"; }