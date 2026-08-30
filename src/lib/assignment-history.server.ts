import type {
  AssignmentHistoryEntry,
  AssignmentHistoryInput,
  AssignmentHistoryPage,
} from "@/lib/assignment-history";

type AnyClient = {
  from: (table: string) => any;
};

type HolderColumn = "agent_id" | "vendor_id" | "landlord_id";

/**
 * Reconstructs assignment/unassignment events for a holder from meter audit logs,
 * then applies search, sorting and pagination server-side.
 */
export async function buildAssignmentHistory(
  supabase: AnyClient,
  column: HolderColumn,
  input: AssignmentHistoryInput,
): Promise<AssignmentHistoryPage> {
  const holderId =
    column === "agent_id" ? input.agentId : column === "vendor_id" ? input.vendorId : input.landlordId;
  if (!holderId) throw new Error("Missing holder id");

  const { data: logs, error } = await supabase
    .from("meter_audit_logs")
    .select("id, meter_id, actor_id, action, changes, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);

  const relevant = ((logs ?? []) as {
    id: string;
    meter_id: string;
    actor_id: string | null;
    changes: unknown;
    created_at: string;
  }[]).filter((log) => {
    const change = (log.changes as Record<string, { old?: unknown; new?: unknown }> | null)?.[column];
    if (!change) return false;
    return change.old === holderId || change.new === holderId;
  });

  const meterIds = [...new Set(relevant.map((l) => l.meter_id))];
  const actorIds = [...new Set(relevant.map((l) => l.actor_id).filter((v): v is string => !!v))];

  const [metersRes, actorsRes] = await Promise.all([
    meterIds.length
      ? supabase.from("meters").select("id, meter_number, serial_number").in("id", meterIds)
      : Promise.resolve({ data: [] }),
    actorIds.length
      ? supabase.from("users").select("id, name, email").in("id", actorIds)
      : Promise.resolve({ data: [] }),
  ]);

  const meterMap = new Map(
    ((metersRes.data ?? []) as { id: string; meter_number: string; serial_number: string }[]).map(
      (m) => [m.id, m],
    ),
  );
  const actorMap = new Map(
    ((actorsRes.data ?? []) as { id: string; name: string | null; email: string | null }[]).map((a) => [
      a.id,
      a,
    ]),
  );

  let entries: AssignmentHistoryEntry[] = relevant.map((log) => {
    const change = (log.changes as Record<string, { old?: unknown; new?: unknown }>)[column]!;
    const meter = meterMap.get(log.meter_id);
    const actor = log.actor_id ? actorMap.get(log.actor_id) : null;
    return {
      id: log.id,
      meter_id: log.meter_id,
      meter_number: meter?.meter_number ?? "Deleted meter",
      serial_number: meter?.serial_number ?? null,
      action: change.new === holderId ? ("assigned" as const) : ("unassigned" as const),
      actor_name: actor?.name ?? actor?.email ?? "System",
      created_at: log.created_at,
    };
  });

  if (input.action !== "all") entries = entries.filter((e) => e.action === input.action);

  const term = input.search?.toLowerCase();
  if (term) {
    entries = entries.filter((e) =>
      [e.meter_number, e.serial_number ?? "", e.actor_name, e.action]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }

  const dir = input.sortDir === "asc" ? 1 : -1;
  entries.sort((a, b) => {
    const key = input.sortBy;
    const av = key === "created_at" ? a.created_at : String(a[key] ?? "");
    const bv = key === "created_at" ? b.created_at : String(b[key] ?? "");
    return av.localeCompare(bv) * dir;
  });

  const total = entries.length;
  const pageCount = Math.max(1, Math.ceil(total / input.pageSize));
  const page = Math.min(input.page, pageCount);
  const start = (page - 1) * input.pageSize;

  return {
    entries: entries.slice(start, start + input.pageSize),
    total,
    page,
    pageSize: input.pageSize,
    pageCount,
  };
}
