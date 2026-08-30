export type MeterAssignmentResult = {
  id: string;
  meter_number: string;
  ok: boolean;
  reason?: string;
};

type RpcClient = {
  rpc: (fn: any, args: any) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Applies meter assignment changes through a single locked database transaction so
 * concurrent bulk assigns cannot overwrite each other.
 */
export async function runMeterAssignment(
  supabase: RpcClient,
  holder: "agent" | "vendor",
  action: "assign" | "unassign",
  holderId: string,
  meterIds: string[],
): Promise<MeterAssignmentResult[]> {
  const { data, error } = await supabase.rpc("apply_meter_assignment", {
    p_holder: holder,
    p_holder_id: holderId,
    p_meter_ids: meterIds,
    p_action: action,
  });
  if (error) throw new Error(error.message);
  const raw = (data as { results?: MeterAssignmentResult[] } | null)?.results ?? [];
  const order = new Map(meterIds.map((id, index) => [id, index]));
  return [...raw].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
