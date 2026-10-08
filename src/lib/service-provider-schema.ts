import { z } from "zod";

const optional = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { message: `${label} must be ${max} characters or less` })
    .optional()
    .or(z.literal(""));

export const serviceEntrySchema = z.object({
  service_name: z
    .string()
    .trim()
    .min(1, { message: "Service name is required" })
    .max(120, { message: "Service name must be 120 characters or less" }),
  description: z
    .string()
    .trim()
    .min(1, { message: "Description is required" })
    .max(1000, { message: "Description must be 1000 characters or less" }),
});

export type ServiceEntry = z.infer<typeof serviceEntrySchema>;

/** Case/space-insensitive key used to detect duplicate services. */
export const serviceKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export const servicesListSchema = z
  .array(serviceEntrySchema)
  .min(1, { message: "Add at least one service" })
  .max(50)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((s, i) => {
      const k = serviceKey(s.service_name);
      if (seen.has(k)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, "service_name"],
          message: "This service has already been added",
        });
      }
      seen.add(k);
    });
  });

export const providerDetailsFields = {
  first_name: z
    .string()
    .trim()
    .min(1, { message: "First name is required" })
    .max(60, { message: "First name must be 60 characters or less" }),
  middle_name: optional(60, "Middle name"),
  last_name: z
    .string()
    .trim()
    .min(1, { message: "Last name is required" })
    .max(60, { message: "Last name must be 60 characters or less" }),
  business_name: optional(120, "Business name"),
  email: z
    .string()
    .trim()
    .min(1, { message: "Email is required" })
    .email({ message: "Enter a valid email address" })
    .max(255),
  phone: z
    .string()
    .trim()
    .min(1, { message: "Phone number is required" })
    .max(20, { message: "Phone must be 20 characters or less" })
    .regex(/^[+]?[0-9\s()-]*$/, { message: "Enter a valid phone number" }),
  username: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-zA-Z0-9._-]*$/, {
      message: "Username can only contain letters, numbers, dots, dashes and underscores",
    })
    .optional()
    .or(z.literal("")),
  address: optional(255, "Address"),
  country: optional(80, "Country"),
  county: optional(80, "County/Region"),
  city: optional(80, "City/Town"),
  postal_address: optional(120, "Postal address"),
  bio: optional(1000, "Bio"),
  notes: optional(2000, "Notes"),
};

export const createServiceProviderSchema = z.object({
  ...providerDetailsFields,
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .max(72)
    .regex(/[A-Za-z]/, { message: "Password must include at least one letter" })
    .regex(/[0-9]/, { message: "Password must include at least one number" }),
  services: servicesListSchema,
});

export type CreateServiceProviderInput = z.input<typeof createServiceProviderSchema>;

export const editServiceProviderSchema = z.object({
  id: z.string().uuid(),
  ...providerDetailsFields,
});

export function fullName(p: { first_name?: string | null | undefined; middle_name?: string | null | undefined; last_name?: string | null | undefined }) {
  return [p.first_name, p.middle_name, p.last_name]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/** Statuses an admin can act on; suspended providers cannot receive new jobs. */
export function providerActions(status: string): ("view" | "edit" | "suspend" | "unsuspend" | "delete")[] {
  return status === "suspended"
    ? ["view", "edit", "unsuspend", "delete"]
    : ["view", "edit", "suspend", "delete"];
}

export function canReceiveJobs(status: string | null | undefined): boolean {
  return (status ?? "active") === "active";
}
