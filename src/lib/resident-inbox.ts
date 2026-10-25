import { z } from "zod";

export const ENQUIRY_STATUSES = ["submitted", "in_review", "approved", "declined", "closed"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

// Allowed staff transitions; terminal statuses (approved/declined/closed) cannot change again.
export const ENQUIRY_TRANSITIONS: Record<EnquiryStatus, EnquiryStatus[]> = {
  submitted: ["in_review", "approved", "declined", "closed"],
  in_review: ["approved", "declined", "closed"],
  approved: [],
  declined: [],
  closed: [],
};
export const canTransitionEnquiry = (from: string, to: string) =>
  (ENQUIRY_TRANSITIONS[from as EnquiryStatus] ?? []).includes(to as EnquiryStatus);

export const inboxFilters = z.object({
  tab: z.enum(["enquiries", "feedback"]),
  q: z.string().trim().max(100).default(""),
  kind: z.enum(["support", "insurance", "loan", "sacco"]).optional(),
  status: z.enum(ENQUIRY_STATUSES).optional(),
  page: z.number().int().min(1).default(1),
});
export const enquiryReply = z.object({
  id: z.string().uuid(),
  response: z.string().trim().min(1).max(2000),
});
export const enquiryDecision = z.object({
  id: z.string().uuid(),
  from: z.enum(ENQUIRY_STATUSES),
  to: z.enum(ENQUIRY_STATUSES),
  response: z.string().trim().max(2000).optional(),
});
export const mayReadResidentInbox = (roles: string[]) => roles.includes("admin");
