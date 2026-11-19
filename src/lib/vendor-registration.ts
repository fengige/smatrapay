import { z } from "zod";
import { normalizeResidentPhone } from "./resident-phone";

export const vendorRegistrationSchema = z.object({
  submission_key: z.string().uuid(),
  business_name: z.string().trim().min(2, "Enter the business name").max(120),
  business_type: z.enum(["Company", "Sole proprietor", "Partnership", "Other"]),
  registration_number: z.string().trim().max(100),
  contact_name: z.string().trim().min(2, "Enter the contact person's name").max(120),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .max(254)
    .transform((v) => v.toLowerCase()),
  phone: z
    .string()
    .trim()
    .max(30)
    .transform((v, ctx) => {
      try {
        return normalizeResidentPhone(v);
      } catch {
        ctx.addIssue({ code: "custom", message: "Enter a valid Kenyan mobile number" });
        return z.NEVER;
      }
    })
    .refine((v) => /^\+254[17]\d{8}$/.test(v), "Enter a Kenyan mobile number"),
  location: z.string().trim().min(3, "Enter your business location").max(500),
  services: z
    .array(z.enum(["Electricity", "Water", "Gas"]))
    .min(1, "Select at least one service")
    .max(3)
    .refine((v) => new Set(v).size === v.length),
  description: z.string().trim().max(1000),
  contact_preference: z.enum(["Email", "Phone"]),
  consent: z.literal(true, { errorMap: () => ({ message: "Please confirm the declaration" }) }),
});
export type VendorRegistration = z.infer<typeof vendorRegistrationSchema>;
export const vendorReviewSchema = z
  .object({
    id: z.string().uuid(),
    decision: z.enum(["Accepted", "Rejected"]),
    reason: z.string().trim().max(1000).default(""),
  })
  .superRefine((v, c) => {
    if (v.decision === "Rejected" && v.reason.length < 3)
      c.addIssue({ code: "custom", path: ["reason"], message: "Enter a rejection reason" });
  });
export const applicationListSchema = z.object({
  q: z.string().trim().max(100).default(""),
  status: z.enum(["All", "Pending", "Accepted", "Rejected"]).default("All"),
  page: z.number().int().min(1).max(10000).default(1),
  limit: z.number().int().min(5).max(100).default(10),
});
