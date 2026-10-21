import { z } from "zod";

// Only the sign-in service's own minimum (6) and maximum (72) apply.
export const managedResidentPassword = z.string().min(6, "Use at least 6 characters.").max(72, "Use no more than 72 characters.");
export const residentAccountTarget = z.object({ id: z.string().uuid(), portal: z.enum(["admin", "vendor"]) });
export const residentAccountPasswordInput = residentAccountTarget.extend({
  password: managedResidentPassword,
  confirmation: z.string().min(1, "Confirm the new password."),
}).refine((value) => value.password === value.confirmation, { message: "Passwords do not match.", path: ["confirmation"] });

export function eligibleResidentRoles(roles: string[]) {
  return roles.includes("resident") && roles.every((role) => role === "resident" || role === "user");
}