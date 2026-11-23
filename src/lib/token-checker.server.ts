import { publicMeterSchema, type CheckedMeter, type SafeToken } from "./meter-search";

export async function findCheckedMeter(db: any, input: unknown) {
  const { meter_number } = publicMeterSchema.parse(input);
  // No wildcard, partial-number, customer or serial-number discovery on public pages.
  const { data, error } = await db.from("meters").select("id, meter_number, type, unit_id")
    .ilike("meter_number", meter_number).limit(2);
  if (error) throw new Error("Meter verification is unavailable. Please try again.");
  return data?.length === 1 ? data[0] as { id: string; meter_number: string; type: string; unit_id: string | null } : null;
}

export async function checkPublicMeter(db: any, input: unknown): Promise<{ meter: CheckedMeter | null; support: { email: string | null; phone: string | null } }> {
  const [meter, settings] = await Promise.all([
    findCheckedMeter(db, input),
    db.from("app_settings").select("key, value").in("key", ["app_support_email", "app_support_phone"]),
  ]);
  const values = new Map<string, string>((settings.error ? [] : settings.data ?? []).map((r: any) => [r.key, r.value]));
  const email = values.get("app_support_email")?.trim() ?? "";
  const phone = values.get("app_support_phone")?.trim() ?? "";
  return { meter: meter ? { meter_number: meter.meter_number, type: meter.type } : null,
    support: { email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      phone: /^\+?[\d ()-]{7,25}$/.test(phone) ? phone : null } };
}

export async function readCheckedTokens(db: any, userId: string, input: unknown): Promise<SafeToken[]> {
  const meter = await findCheckedMeter(db, input);
  if (!meter?.unit_id) throw new Error("This meter is not linked to your resident account. Contact the administrator.");
  const { data: profile, error: profileError } = await db.from("users").select("status").eq("id", userId).maybeSingle();
  const { data: roles, error: roleError } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (profileError || roleError || profile?.status !== "active" || !roles?.some((r: any) => r.role === "resident")) {
    throw new Error("An active resident account is required.");
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const { data: assignments, error } = await db.from("unit_assignments")
    .select("start_date, end_date").eq("user_id", userId).eq("unit_id", meter.unit_id).eq("role", "resident")
    .lte("start_date", today).order("start_date", { ascending: false });
  if (error) throw new Error("Could not verify meter access. Please try again.");
  const assignment = assignments?.find((a: any) => !a.end_date || a.end_date >= today);
  if (!assignment) throw new Error("This meter is not linked to your resident account. Contact the administrator.");
  // Canonical ID and occupancy dates are resolved by the server, never provided by the browser.
  let query = db.from("meter_tokens").select("created_at, amount, units, token, status, expires_at, reference, provider_reference")
    .eq("meter_id", meter.id).eq("action", "credit")
    .gte("created_at", `${assignment.start_date}T00:00:00+03:00`);
  if (assignment.end_date) query = query.lt("created_at", `${assignment.end_date}T23:59:59.999+03:00`);
  const [result, unitResult] = await Promise.all([
    query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(3),
    db.from("units").select("unit_number, property_id").eq("id", meter.unit_id).maybeSingle(),
  ]);
  if (result.error) throw new Error("Could not load recent tokens. Please try again.");
  // Unit/property names are display-only; a failed lookup never blocks the token history.
  let unit: string | null = null; let property: string | null = null;
  const unitRow = unitResult.error ? null : unitResult.data;
  if (unitRow) {
    unit = unitRow.unit_number ?? null;
    if (unitRow.property_id) {
      const { data: propertyRow } = await db.from("properties").select("name").eq("id", unitRow.property_id).maybeSingle();
      property = propertyRow?.name ?? null;
    }
  }
  return (result.data ?? []).map((r: any) => {
    const status = r.status === "issued" && new Date(r.expires_at).getTime() < Date.now() ? "expired" : r.status;
    return { date: r.created_at, property, unit, meter: meter.meter_number,
      token: status === "issued" ? r.token : null, units: Number(r.units ?? 0), amount: Number(r.amount ?? 0),
      reference: r.reference ?? r.provider_reference ?? null, status };
  });
}