import { z } from "zod";

export const landlordAccountTarget = z.object({ id: z.string().uuid() });
export const landlordAccountPasswordInput = landlordAccountTarget.extend({
  password: z.string().min(6, "Use at least 6 characters.").max(72, "Use no more than 72 characters."),
  confirmation: z.string().min(1, "Confirm the new password.").max(72),
}).refine(value => value.password === value.confirmation, { path: ["confirmation"], message: "Passwords do not match." });

export function eligibleLandlordAccountRoles(roles: string[]) {
  return roles.includes("landlord") && roles.every(role => role === "landlord" || role === "user");
}