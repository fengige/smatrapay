import { z } from "zod";

export const managedResidentPassword = z.string().min(8, "Use at least 8 characters.").max(72, "Use no more than 72 characters.")
  .regex(/[A-Z]/, "Include an uppercase letter.").regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[0-9]/, "Include a number.").regex(/[^A-Za-z0-9]/, "Include a symbol.");
export const residentAccountTarget = z.object({ id: z.string().uuid(), portal: z.enum(["admin", "vendor"]) });
export const residentAccountPasswordInput = residentAccountTarget.extend({
  password: managedResidentPassword,
  confirmation: z.string().min(1, "Confirm the new password."),
}).refine((value) => value.password === value.confirmation, { message: "Passwords do not match.", path: ["confirmation"] });

export function eligibleResidentRoles(roles: string[]) {
  return roles.includes("resident") && roles.every((role) => role === "resident" || role === "user");
}