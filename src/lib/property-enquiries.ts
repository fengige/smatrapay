import { z } from "zod";
const t = (max: number) => z.string().trim().max(max);
export const propertyEnquirySchema = z.object({
  first_name: t(80).min(1, "First name is required"),
  last_name: t(80).min(1, "Last name is required"),
  email: t(255).email("Enter a valid email"),
  phone: t(30).regex(/^\+?[0-9 ()-]{7,30}$/, "Enter a valid phone number"),
  city: t(100).min(1, "City / town is required"),
  premises: t(60).optional(),
  property_type: t(60).optional(),
  current_main_meter: t(60).optional(),
  meters_needed: z.array(z.enum(["Electricity", "Water", "Gas"])).max(3).default([]),
  message: t(2000).optional(),
});
export type PropertyEnquiry = z.infer<typeof propertyEnquirySchema>;
