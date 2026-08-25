import { z } from "zod";

export const userStatusEnum = z.enum(["active", "inactive", "suspended", "pending"]);
export const userRoleEnum = z.enum([
  "admin",
  "landlord",
  "vendor",
  "agent",
  "service_provider",
  "resident",
  "moderator",
  "user",
]);

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { message: `${label} must be ${max} characters or less` })
    .optional()
    .or(z.literal(""));

/** Resident-specific residency details, shared by create and edit forms. */
export const residencyFields = {
  property: optionalText(120, "Property"),
  building: optionalText(120, "Building"),
  unit_number: optionalText(40, "Unit / house number"),
  move_in_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Enter a valid date" })
    .optional()
    .or(z.literal("")),
};


export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: "Full name must be at least 2 characters" })
    .max(120, { message: "Full name must be 120 characters or less" }),
  email: z
    .string()
    .trim()
    .min(1, { message: "Email is required" })
    .email({ message: "Enter a valid email address" })
    .max(255, { message: "Email must be 255 characters or less" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .max(72, { message: "Password must be 72 characters or less" })
    .regex(/[A-Za-z]/, { message: "Password must include at least one letter" })
    .regex(/[0-9]/, { message: "Password must include at least one number" }),
  username: z
    .string()
    .trim()
    .max(60, { message: "Username must be 60 characters or less" })
    .regex(/^[a-zA-Z0-9._-]*$/, {
      message: "Username can only contain letters, numbers, dots, dashes and underscores",
    })
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .max(20, { message: "Phone must be 20 characters or less" })
    .regex(/^[+]?[0-9\s()-]*$/, { message: "Enter a valid phone number" })
    .optional()
    .or(z.literal("")),
  bio: optionalText(1000, "Bio"),
  notes: optionalText(2000, "Notes"),
  status: userStatusEnum.default("active"),
  ...residencyFields,
  role: userRoleEnum.default("user"),

});

export type CreateUserInput = z.input<typeof createUserSchema>;

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

export const editUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: "Full name must be at least 2 characters" })
    .max(120, { message: "Full name must be 120 characters or less" }),
  email: z
    .string()
    .trim()
    .min(1, { message: "Email is required" })
    .email({ message: "Enter a valid email address" })
    .max(255, { message: "Email must be 255 characters or less" }),
  username: z
    .string()
    .trim()
    .max(60, { message: "Username must be 60 characters or less" })
    .regex(/^[a-zA-Z0-9._-]*$/, {
      message: "Username can only contain letters, numbers, dots, dashes and underscores",
    })
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .max(20, { message: "Phone must be 20 characters or less" })
    .regex(/^[+]?[0-9\s()-]*$/, { message: "Enter a valid phone number" })
    .optional()
    .or(z.literal("")),
  bio: optionalText(1000, "Bio"),
  notes: optionalText(2000, "Notes"),
  role: userRoleEnum,
  status: userStatusEnum,
});

export type EditUserInput = z.input<typeof editUserSchema>;
