import { z } from "zod";

/** Client-safe input contract for paginated + sortable meter assignment history. */
export const assignmentHistorySchema = z.object({
  agentId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  landlordId: z.string().uuid().optional(),
  page: z.number().int().min(1).max(500).default(1),
  pageSize: z.number().int().min(5).max(100).default(10),
  sortBy: z.enum(["created_at", "meter_number", "action", "actor_name"]).default("created_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().trim().max(120).optional(),
  action: z.enum(["all", "assigned", "unassigned"]).default("all"),
});

export type AssignmentHistoryInput = z.infer<typeof assignmentHistorySchema>;

export type AssignmentHistoryEntry = {
  id: string;
  meter_id: string;
  meter_number: string;
  serial_number: string | null;
  action: "assigned" | "unassigned";
  actor_name: string;
  created_at: string;
};

export type AssignmentHistoryPage = {
  entries: AssignmentHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};
