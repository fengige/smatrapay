import { z } from "zod";

export const inboxFilters = z.object({
  tab: z.enum(["enquiries", "feedback"]),
  q: z.string().trim().max(100).default(""),
  kind: z.enum(["support", "insurance", "loan"]).optional(),
  page: z.number().int().min(1).default(1),
});
export const enquiryReply = z.object({
  id: z.string().uuid(),
  response: z.string().trim().min(1).max(2000),
});
export const mayReadResidentInbox = (roles: string[]) => roles.includes("admin");