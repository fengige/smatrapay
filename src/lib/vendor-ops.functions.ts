import { createServerFn } from "@tanstack/react-start";
import { truncateUnits, unitsFromAmount, formatUnits } from "@/lib/token-units";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Prepaid meter operations for the Vendor Portal.
 * Every handler resolves the vendor from the authenticated session — a vendor id
 * is never accepted from the client — and re-checks ownership of each resource.
 */

const uuid = z.string().uuid();

export const ISSUE_TYPES = [
  "Meter Not Working",
  "Meter Offline",
  "Token Not Accepted",
  "Meter Display Fault",
  "Low Battery",
  "Communication Failure",
  "Meter Tampering",
  "Meter Replacement",
  "Installation Problem",
  "Payment/Token Problem",
  "Other",
] as const;

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const REQUEST_STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
  "cancelled",
] as const;
export const ASSIGNMENT_STATUSES = [
  "pending",
  "scheduled",
  "assigned",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
] as const;
export const READING_TYPES = [
  "manual",
  "automatic",
  "inspection",
  "installation",
  "maintenance",
] as const;
export const DEACTIVATION_REASONS = [
  "Faulty Meter",
  "Meter Replacement",
  "Resident Vacated",
  "Maintenance",
  "Tampering",
  "Administrative Instruction",
  "Other",
] as const;
export const MEMBER_ROLES = ["Team Leader", "Installer", "Technician", "Assistant"] as const;

export type ActivationEntry = {
  id: string;
  meter_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  notes: string | null;
  actor_name: string | null;
  created_at: string;
};

export type VendorTokenRow = {
  id: string;
  meter_id: string;
  token: string;
  action: string;
  units: number;
  amount: number;
  reference: string | null;
  customer_phone: string | null;
  status: string;
  payment_status: string | null;
  payment_id: string | null;
  expires_at: string;
  created_at: string;
};

export type ReadingRow = {
  id: string;
  meter_id: string;
  resident_id: string | null;
  reading: number;
  previous_reading: number | null;
  consumption: number | null;
  unit: string;
  reading_date: string;
  reading_type: string;
  status: string;
  notes: string | null;
  recorded_by: string | null;
  recorded_by_name: string | null;
  photo_paths: string[];
  created_at: string;
};

export type ServiceRequestRow = {
  id: string;
  request_number: string;
  meter_id: string | null;
  resident_id: string | null;
  zone_id: number | null;
  issue_type: string;
  priority: string;
  status: string;
  description: string | null;
  preferred_date: string | null;
  team_id: string | null;
  technician_id: string | null;
  technician_name: string | null;
  technician_phone: string | null;
  assigned_at: string | null;
  resolution: string | null;
  work_performed: string | null;
  parts_used: string | null;
  meter_status_after: string | null;
  final_reading: number | null;
  resident_acknowledged: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceEventRow = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  storage_path: string | null;
  created_at: string;
};

export type TeamRow = {
  id: string;
  name: string;
  leader_name: string | null;
  phone: string | null;
  description: string | null;
  status: string;
  member_count: number;
  active_assignments: number;
  completed_installations: number;
  created_at: string;
};

export type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string | null;
  name: string;
  phone: string | null;
  role: string;
  status: string;
  open_requests: number;
};

export type InstallationAssignmentRow = {
  id: string;
  assignment_number: string;
  meter_id: string;
  team_id: string | null;
  resident_id: string | null;
  zone_id: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  location: string | null;
  notes: string | null;
  status: string;
  installer_name: string | null;
  completion_reading: number | null;
  completion_notes: string | null;
  completed_at: string | null;
  created_at: string;
};

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

export const getVendorOpsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertVendor } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const today = startOfDay.toISOString();

    const [metersRes, tokensRes, paymentsRes, requestsRes, assignmentsRes] = await Promise.all([
      supabase.from("meters").select("id, status, installation_status").eq("vendor_id", vendorId),
      supabase.from("meter_tokens").select("id, amount, status, created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("payments").select("id, amount, status, created_at").gte("created_at", today).limit(500),
      supabase.from("service_requests").select("id, status").eq("vendor_id", vendorId),
      supabase
        .from("meter_installation_assignments")
        .select("id, status")
        .eq("vendor_id", vendorId),
    ]);

    const meters = (metersRes.data ?? []) as any[];
    const tokens = (tokensRes.data ?? []) as any[];
    const payments = (paymentsRes.data ?? []) as any[];
    const requests = (requestsRes.data ?? []) as any[];
    const assignments = (assignmentsRes.data ?? []) as any[];

    return {
      active_meters: meters.filter((m) => m.status === "active").length,
      pending_activation: meters.filter(
        (m) => m.status !== "active" && m.installation_status === "installed",
      ).length,
      recent_token_requests: tokens.filter((t) => t.created_at >= today).length,
      tokens_total: tokens.length,
      payments_today: payments
        .filter((p) => p.status === "completed")
        .reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
      open_service_requests: requests.filter(
        (r) => !["closed", "cancelled", "resolved"].includes(r.status),
      ).length,
      pending_installations: assignments.filter(
        (a) => !["completed", "cancelled", "failed"].includes(a.status),
      ).length,
      completed_installations: assignments.filter((a) => a.status === "completed").length,
    };
  });

export const listActivationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ meter_id: uuid.optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { assertVendor } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    let query = supabase
      .from("meter_activation_history")
      .select("id, meter_id, action, previous_status, new_status, reason, notes, actor_id, created_at")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.meter_id) query = query.eq("meter_id", data.meter_id);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const { data: me } = await supabase.from("users").select("id, name, email").eq("id", vendorId).maybeSingle();
    const label = me?.name ?? me?.email ?? null;
    return {
      entries: ((rows ?? []) as any[]).map((r) => ({
        id: r.id,
        meter_id: r.meter_id,
        action: r.action,
        previous_status: r.previous_status,
        new_status: r.new_status,
        reason: r.reason,
        notes: r.notes,
        actor_name: r.actor_id === vendorId ? label : null,
        created_at: r.created_at,
      })) as ActivationEntry[],
    };
  });

export const listVendorTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ meter_id: uuid.optional(), from: z.string().optional(), to: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;

    const { data: meterRows } = await supabase.from("meters").select("id").eq("vendor_id", vendorId);
    const meterIds = ((meterRows ?? []) as any[]).map((m) => m.id as string);
    if (!meterIds.length) return { tokens: [] as VendorTokenRow[] };

    let query = supabase
      .from("meter_tokens")
      .select("id, meter_id, token, action, units, amount, reference, customer_phone, status, expires_at, created_at")
      .in("meter_id", data.meter_id ? [data.meter_id] : meterIds)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.from) query = query.gte("created_at", data.from);
    if (data.to) query = query.lte("created_at", data.to);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const references = ((rows ?? []) as any[]).map((r) => r.reference).filter(Boolean) as string[];
    const paymentByRef = new Map<string, any>();
    if (references.length) {
      const { data: pays } = await supabase
        .from("payments")
        .select("id, reference, status")
        .in("reference", references);
      for (const p of (pays ?? []) as any[]) paymentByRef.set(p.reference, p);
    }

    await logVendorAction(supabase, vendorId, "VENDOR_TOKEN_TRANSACTION_VIEWED", { type: "meter_tokens" });

    return {
      tokens: ((rows ?? []) as any[]).map((r) => {
        const payment = r.reference ? paymentByRef.get(r.reference) : null;
        const expired = r.status === "issued" && new Date(r.expires_at).getTime() < Date.now();
        return {
          id: r.id,
          meter_id: r.meter_id,
          token: r.token,
          action: r.action,
          units: Number(r.units ?? 0),
          amount: Number(r.amount ?? 0),
          reference: r.reference ?? null,
          customer_phone: r.customer_phone ?? null,
          status: expired ? "expired" : r.status,
          payment_status: payment?.status ?? null,
          payment_id: payment?.id ?? null,
          expires_at: r.expires_at,
          created_at: r.created_at,
        } as VendorTokenRow;
      }),
    };
  });

export const listVendorReadings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ meter_id: uuid.optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { assertVendor } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    let query = supabase
      .from("meter_readings")
      .select(
        "id, meter_id, resident_id, reading, previous_reading, consumption, unit, reading_date, reading_type, status, notes, recorded_by, created_at",
      )
      .eq("vendor_id", vendorId)
      .order("reading_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.meter_id) query = query.eq("meter_id", data.meter_id);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as any[];
    const ids = list.map((r) => r.id as string);
    const photos = new Map<string, string[]>();
    if (ids.length) {
      const { data: atts } = await supabase
        .from("meter_reading_attachments")
        .select("reading_id, storage_path")
        .in("reading_id", ids);
      for (const a of (atts ?? []) as any[]) {
        photos.set(a.reading_id, [...(photos.get(a.reading_id) ?? []), a.storage_path]);
      }
    }
    const actorIds = [...new Set(list.map((r) => r.recorded_by).filter(Boolean))] as string[];
    const actors = new Map<string, string>();
    if (actorIds.length) {
      const { data: users } = await supabase.from("users").select("id, name, email").in("id", actorIds);
      for (const u of (users ?? []) as any[]) actors.set(u.id, u.name ?? u.email ?? u.id);
    }

    return {
      readings: list.map((r) => ({
        id: r.id,
        meter_id: r.meter_id,
        resident_id: r.resident_id ?? null,
        reading: Number(r.reading ?? 0),
        previous_reading: r.previous_reading == null ? null : Number(r.previous_reading),
        consumption: r.consumption == null ? null : Number(r.consumption),
        unit: r.unit ?? "kWh",
        reading_date: r.reading_date,
        reading_type: r.reading_type,
        status: r.status,
        notes: r.notes ?? null,
        recorded_by: r.recorded_by ?? null,
        recorded_by_name: r.recorded_by ? (actors.get(r.recorded_by) ?? null) : null,
        photo_paths: photos.get(r.id) ?? [],
        created_at: r.created_at,
      })) as ReadingRow[],
    };
  });

function mapRequest(r: any, technicians: Map<string, any>): ServiceRequestRow {
  const tech = r.technician_id ? technicians.get(r.technician_id) : null;
  return {
    id: r.id,
    request_number: r.request_number,
    meter_id: r.meter_id ?? null,
    resident_id: r.resident_id ?? null,
    zone_id: r.zone_id ?? null,
    issue_type: r.issue_type,
    priority: r.priority,
    status: r.status,
    description: r.description ?? null,
    preferred_date: r.preferred_date ?? null,
    team_id: r.team_id ?? null,
    technician_id: r.technician_id ?? null,
    technician_name: tech?.name ?? null,
    technician_phone: tech?.phone ?? null,
    assigned_at: r.assigned_at ?? null,
    resolution: r.resolution ?? null,
    work_performed: r.work_performed ?? null,
    parts_used: r.parts_used ?? null,
    meter_status_after: r.meter_status_after ?? null,
    final_reading: r.final_reading == null ? null : Number(r.final_reading),
    resident_acknowledged: !!r.resident_acknowledged,
    completed_at: r.completed_at ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

const REQUEST_COLUMNS =
  "id, request_number, meter_id, resident_id, zone_id, issue_type, priority, status, description, preferred_date, team_id, technician_id, assigned_at, resolution, work_performed, parts_used, meter_status_after, final_reading, resident_acknowledged, completed_at, created_at, updated_at";

export const listServiceRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertVendor } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const [reqRes, techRes] = await Promise.all([
      supabase
        .from("service_requests")
        .select(REQUEST_COLUMNS)
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("installation_team_members").select("id, name, phone").eq("vendor_id", vendorId),
    ]);
    if (reqRes.error) throw new Error(reqRes.error.message);
    const techs = new Map<string, any>();
    for (const t of (techRes.data ?? []) as any[]) techs.set(t.id, t);
    return { requests: ((reqRes.data ?? []) as any[]).map((r) => mapRequest(r, techs)) };
  });

export const getServiceRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const { data: row, error } = await supabase
      .from("service_requests")
      .select(REQUEST_COLUMNS)
      .eq("id", data.id)
      .eq("vendor_id", vendorId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Service request not found");

    const [techRes, eventsRes] = await Promise.all([
      supabase.from("installation_team_members").select("id, name, phone").eq("vendor_id", vendorId),
      supabase
        .from("service_request_events")
        .select("id, event_type, from_status, to_status, note, storage_path, created_at")
        .eq("request_id", data.id)
        .order("created_at", { ascending: true }),
    ]);
    const techs = new Map<string, any>();
    for (const t of (techRes.data ?? []) as any[]) techs.set(t.id, t);
    await logVendorAction(supabase, vendorId, "VENDOR_SERVICE_REQUEST_VIEWED", {
      type: "service_request",
      id: data.id,
    });
    return {
      request: mapRequest(row, techs),
      events: (eventsRes.data ?? []) as ServiceEventRow[],
    };
  });

export const listInstallationTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertVendor } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const [teamsRes, membersRes, assignRes, reqRes] = await Promise.all([
      supabase
        .from("installation_teams")
        .select("id, name, leader_name, phone, description, status, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false }),
      supabase.from("installation_team_members").select("id, team_id, user_id, name, phone, role, status").eq("vendor_id", vendorId),
      supabase.from("meter_installation_assignments").select("id, team_id, status").eq("vendor_id", vendorId),
      supabase.from("service_requests").select("id, technician_id, status").eq("vendor_id", vendorId),
    ]);
    if (teamsRes.error) throw new Error(teamsRes.error.message);
    const members = (membersRes.data ?? []) as any[];
    const assignments = (assignRes.data ?? []) as any[];
    const requests = (reqRes.data ?? []) as any[];

    const teams: TeamRow[] = ((teamsRes.data ?? []) as any[]).map((t) => ({
      id: t.id,
      name: t.name,
      leader_name: t.leader_name ?? null,
      phone: t.phone ?? null,
      description: t.description ?? null,
      status: t.status,
      member_count: members.filter((m) => m.team_id === t.id).length,
      active_assignments: assignments.filter(
        (a) => a.team_id === t.id && !["completed", "cancelled", "failed"].includes(a.status),
      ).length,
      completed_installations: assignments.filter((a) => a.team_id === t.id && a.status === "completed").length,
      created_at: t.created_at,
    }));

    const memberRows: TeamMemberRow[] = members.map((m) => ({
      id: m.id,
      team_id: m.team_id,
      user_id: m.user_id ?? null,
      name: m.name,
      phone: m.phone ?? null,
      role: m.role,
      status: m.status,
      open_requests: requests.filter(
        (r) => r.technician_id === m.id && !["closed", "cancelled", "resolved"].includes(r.status),
      ).length,
    }));

    return { teams, members: memberRows };
  });

export const listInstallationAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertVendor } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const { data, error } = await supabase
      .from("meter_installation_assignments")
      .select(
        "id, assignment_number, meter_id, team_id, resident_id, zone_id, scheduled_date, scheduled_time, location, notes, status, installer_name, completion_reading, completion_notes, completed_at, created_at",
      )
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { assignments: (data ?? []) as InstallationAssignmentRow[] };
  });

/* ------------------------------------------------------------------ *
 * Meter activation
 * ------------------------------------------------------------------ */

async function ownedMeter(supabase: any, vendorId: string, meterId: string) {
  const { data } = await supabase
    .from("meters")
    .select("id, meter_number, status, installation_status, unit_id, price_per_unit, initial_reading")
    .eq("id", meterId)
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (!data) throw new Error("Access denied");
  return data as any;
}

export const activateVendorMeter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ meter_id: uuid, notes: z.string().trim().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const meter = await ownedMeter(supabase, vendorId, data.meter_id);

    if (meter.status === "active") throw new Error("This meter is already active");
    if (!meter.unit_id) throw new Error("Assign this meter to a unit before activating it");
    if (meter.installation_status !== "installed")
      throw new Error("Installation must be completed before this meter can be activated");

    const { error } = await supabase
      .from("meters")
      .update({ status: "active" })
      .eq("id", data.meter_id)
      .eq("vendor_id", vendorId);
    if (error) throw new Error(error.message);

    await supabase.from("meter_activation_history").insert({
      meter_id: data.meter_id,
      vendor_id: vendorId,
      actor_id: vendorId,
      action: "activated",
      previous_status: meter.status,
      new_status: "active",
      notes: data.notes ?? null,
    });
    await logVendorAction(supabase, vendorId, "VENDOR_METER_ACTIVATED", { type: "meter", id: data.meter_id }, {
      meter_number: meter.meter_number,
    });
    await notify(
      supabase,
      vendorId,
      "meter_activated",
      "Meter activated",
      `Meter ${meter.meter_number} is now active.`,
      { type: "meter", id: data.meter_id },
    );
    return { ok: true };
  });

export const deactivateVendorMeter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        meter_id: uuid,
        reason: z.enum(DEACTIVATION_REASONS),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const meter = await ownedMeter(supabase, vendorId, data.meter_id);
    if (meter.status !== "active") throw new Error("This meter is not active");

    const { error } = await supabase
      .from("meters")
      .update({ status: "inactive" })
      .eq("id", data.meter_id)
      .eq("vendor_id", vendorId);
    if (error) throw new Error(error.message);

    await supabase.from("meter_activation_history").insert({
      meter_id: data.meter_id,
      vendor_id: vendorId,
      actor_id: vendorId,
      action: "deactivated",
      previous_status: meter.status,
      new_status: "inactive",
      reason: data.reason,
      notes: data.notes ?? null,
    });
    await logVendorAction(supabase, vendorId, "VENDOR_METER_DEACTIVATED", { type: "meter", id: data.meter_id }, {
      meter_number: meter.meter_number,
      reason: data.reason,
    });
    await notify(
      supabase,
      vendorId,
      "meter_deactivated",
      "Meter deactivated",
      `Meter ${meter.meter_number} was deactivated (${data.reason}).`,
      { type: "meter", id: data.meter_id },
    );
    return { ok: true };
  });

/* ------------------------------------------------------------------ *
 * Token & payments
 * ------------------------------------------------------------------ */

function generateTokenValue() {
  let out = "";
  for (let i = 0; i < 20; i += 1) out += Math.floor(Math.random() * 10);
  return out.replace(/(\d{4})(?=\d)/g, "$1-");
}

export const requestVendorToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        meter_id: uuid,
        resident_id: uuid.nullable().optional(),
        amount: z.number().positive("Enter an amount greater than zero").max(10_000_000),
        phone: z.string().trim().max(30).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const meter = await ownedMeter(supabase, vendorId, data.meter_id);
    if (meter.status !== "active") throw new Error("Activate this meter before requesting a token");

    const price = Number(meter.price_per_unit ?? 0);
    const units = price > 0 ? unitsFromAmount(data.amount, price) : 0;
    const reference = `VT-${Date.now().toString(36).toUpperCase()}`;

    const { data: token, error } = await supabase
      .from("meter_tokens")
      .insert({
        meter_id: data.meter_id,
        action: "credit",
        token: generateTokenValue(),
        units,
        amount: data.amount,
        reference,
        customer_phone: data.phone?.trim() || null,
        sms_requested: false,
        expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        issued_by: vendorId,
      })
      .select("id, token, units, amount, reference, created_at")
      .single();
    if (error) throw new Error(error.message);

    let paymentStatus: string | null = null;
    if (data.resident_id) {
      const { error: payErr } = await supabase.from("payments").insert({
        payee_type: "resident",
        payee_id: data.resident_id,
        amount: data.amount,
        currency: "KES",
        status: "completed",
        reference,
        description: `Prepaid token for meter ${meter.meter_number}`,
        paid_at: new Date().toISOString(),
        created_by: vendorId,
      });
      paymentStatus = payErr ? null : "completed";
      if (!payErr) {
        await notify(
          supabase,
          data.resident_id,
          "token_issued",
          "Prepaid token issued",
          `Token ${token.token} (${units} units) was issued for meter ${meter.meter_number}.`,
          { type: "meter", id: data.meter_id },
        );
      }
    }

    await logVendorAction(supabase, vendorId, "VENDOR_TOKEN_REQUESTED", { type: "meter_token", id: token.id }, {
      meter_number: meter.meter_number,
      amount: data.amount,
      units,
      reference,
    });
    await notify(
      supabase,
      vendorId,
      "token_request_successful",
      "Token request successful",
      `Token issued for meter ${meter.meter_number} (${units} units).`,
      { type: "meter_token", id: token.id },
    );

    return { ok: true, token: { ...token, payment_status: paymentStatus } };
  });

/* ------------------------------------------------------------------ *
 * Meter readings
 * ------------------------------------------------------------------ */

export const addVendorReading = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        meter_id: uuid,
        resident_id: uuid.nullable().optional(),
        reading: z.number().nonnegative("Reading cannot be negative"),
        reading_date: z.string().trim().min(4),
        reading_type: z.enum(READING_TYPES).default("manual"),
        unit: z.string().trim().max(20).default("kWh"),
        notes: z.string().trim().max(1000).optional(),
        photo_paths: z.array(z.string().trim().max(400)).max(5).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const meter = await ownedMeter(supabase, vendorId, data.meter_id);

    const { data: last } = await supabase
      .from("meter_readings")
      .select("reading")
      .eq("meter_id", data.meter_id)
      .order("reading_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const previous = last ? Number(last.reading) : Number(meter.initial_reading ?? 0);
    const consumption = Number((data.reading - previous).toFixed(3));
    const status = consumption < 0 ? "flagged" : "recorded";

    const { data: created, error } = await supabase
      .from("meter_readings")
      .insert({
        meter_id: data.meter_id,
        vendor_id: vendorId,
        resident_id: data.resident_id ?? null,
        reading: data.reading,
        previous_reading: previous,
        consumption,
        unit: data.unit,
        reading_date: data.reading_date,
        reading_type: data.reading_type,
        status,
        notes: data.notes ?? null,
        recorded_by: vendorId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    for (const path of data.photo_paths ?? []) {
      await supabase.from("meter_reading_attachments").insert({
        reading_id: created.id,
        meter_id: data.meter_id,
        vendor_id: vendorId,
        storage_path: path,
        uploaded_by: vendorId,
      });
    }

    await logVendorAction(supabase, vendorId, "VENDOR_METER_READING_CREATED", { type: "meter_reading", id: created.id }, {
      meter_number: meter.meter_number,
      reading: data.reading,
      status,
    });
    if (status === "flagged") {
      await notify(
        supabase,
        vendorId,
        "reading_flagged",
        "Reading flagged for review",
        `Meter ${meter.meter_number}: new reading is lower than the previous reading.`,
        { type: "meter_reading", id: created.id },
      );
    }
    return { ok: true, id: created.id as string, status, consumption, previous };
  });

/* ------------------------------------------------------------------ *
 * Service requests
 * ------------------------------------------------------------------ */

export const createServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        meter_id: uuid,
        resident_id: uuid.nullable().optional(),
        zone_id: z.number().int().nullable().optional(),
        issue_type: z.enum(ISSUE_TYPES),
        priority: z.enum(PRIORITIES).default("medium"),
        description: z.string().trim().max(2000).optional(),
        preferred_date: z.string().trim().max(40).nullable().optional(),
        attachment_paths: z.array(z.string().trim().max(400)).max(5).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const meter = await ownedMeter(supabase, vendorId, data.meter_id);

    const { data: created, error } = await supabase
      .from("service_requests")
      .insert({
        vendor_id: vendorId,
        meter_id: data.meter_id,
        resident_id: data.resident_id ?? null,
        zone_id: data.zone_id ?? null,
        issue_type: data.issue_type,
        priority: data.priority,
        description: data.description ?? null,
        preferred_date: data.preferred_date || null,
        created_by: vendorId,
      })
      .select("id, request_number")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("service_request_events").insert({
      request_id: created.id,
      vendor_id: vendorId,
      actor_id: vendorId,
      event_type: "created",
      to_status: "open",
      note: data.description ?? null,
    });
    for (const path of data.attachment_paths ?? []) {
      await supabase.from("service_request_events").insert({
        request_id: created.id,
        vendor_id: vendorId,
        actor_id: vendorId,
        event_type: "attachment",
        storage_path: path,
      });
    }

    await logVendorAction(supabase, vendorId, "VENDOR_SERVICE_REQUEST_CREATED", {
      type: "service_request",
      id: created.id,
    }, { request_number: created.request_number, meter_number: meter.meter_number });
    await notify(
      supabase,
      vendorId,
      "service_request_created",
      "New service request",
      `${created.request_number} raised for meter ${meter.meter_number}.`,
      { type: "service_request", id: created.id },
    );
    return { ok: true, id: created.id as string, request_number: created.request_number as string };
  });

async function ownedRequest(supabase: any, vendorId: string, id: string) {
  const { data } = await supabase
    .from("service_requests")
    .select("id, request_number, status, meter_id")
    .eq("id", id)
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (!data) throw new Error("Access denied");
  return data as any;
}

export const updateServiceRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, status: z.enum(REQUEST_STATUSES), note: z.string().trim().max(1000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const request = await ownedRequest(supabase, vendorId, data.id);
    if (request.status === data.status) throw new Error("The request already has that status");

    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "resolved") patch["completed_at"] = new Date().toISOString();
    const { error } = await supabase
      .from("service_requests")
      .update(patch)
      .eq("id", data.id)
      .eq("vendor_id", vendorId);
    if (error) throw new Error(error.message);

    await supabase.from("service_request_events").insert({
      request_id: data.id,
      vendor_id: vendorId,
      actor_id: vendorId,
      event_type: "status_change",
      from_status: request.status,
      to_status: data.status,
      note: data.note ?? null,
    });
    await logVendorAction(supabase, vendorId, "VENDOR_SERVICE_REQUEST_UPDATED", {
      type: "service_request",
      id: data.id,
    }, { from: request.status, to: data.status });
    await notify(
      supabase,
      vendorId,
      data.status === "resolved" ? "service_request_resolved" : "service_request_updated",
      `Service request ${data.status.replace(/_/g, " ")}`,
      `${request.request_number} is now ${data.status.replace(/_/g, " ")}.`,
      { type: "service_request", id: data.id },
    );
    return { ok: true };
  });

export const assignServiceTechnician = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, technician_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const request = await ownedRequest(supabase, vendorId, data.id);

    const { data: tech } = await supabase
      .from("installation_team_members")
      .select("id, name, team_id, user_id")
      .eq("id", data.technician_id)
      .eq("vendor_id", vendorId)
      .maybeSingle();
    if (!tech) throw new Error("Access denied");
    if (tech.user_id) {
      // Suspended or deleted service providers keep their history but cannot take new jobs.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: account } = await (supabaseAdmin as any)
        .from("users")
        .select("status")
        .eq("id", tech.user_id)
        .maybeSingle();
      if (account && account.status !== "active") {
        throw new Error("This technician's account is suspended and cannot receive new jobs");
      }
    }

    const { error } = await supabase
      .from("service_requests")
      .update({
        technician_id: tech.id,
        team_id: tech.team_id,
        assigned_at: new Date().toISOString(),
        status: request.status === "open" ? "assigned" : request.status,
      })
      .eq("id", data.id)
      .eq("vendor_id", vendorId);
    if (error) throw new Error(error.message);

    await supabase.from("service_request_events").insert({
      request_id: data.id,
      vendor_id: vendorId,
      actor_id: vendorId,
      event_type: "technician_assigned",
      from_status: request.status,
      to_status: request.status === "open" ? "assigned" : request.status,
      note: `Assigned to ${tech.name}`,
    });
    await logVendorAction(supabase, vendorId, "VENDOR_SERVICE_REQUEST_ASSIGNED", {
      type: "service_request",
      id: data.id,
    }, { technician: tech.name });
    await notify(
      supabase,
      vendorId,
      "service_request_assigned",
      "Service request assigned",
      `${request.request_number} assigned to ${tech.name}.`,
      { type: "service_request", id: data.id },
    );
    if (tech.user_id) {
      await notify(
        supabase,
        tech.user_id,
        "service_request_assigned",
        "New service request assigned to you",
        `${request.request_number} has been assigned to you.`,
        { type: "service_request", id: data.id },
      );
    }
    return { ok: true };
  });

export const completeServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        resolution: z.string().trim().min(3, "Describe the resolution").max(2000),
        work_performed: z.string().trim().max(2000).optional(),
        parts_used: z.string().trim().max(1000).optional(),
        meter_status_after: z.string().trim().max(60).optional(),
        final_reading: z.number().nonnegative().nullable().optional(),
        resident_acknowledged: z.boolean().default(false),
        before_photo: z.string().trim().max(400).optional(),
        after_photo: z.string().trim().max(400).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const request = await ownedRequest(supabase, vendorId, data.id);

    const { error } = await supabase
      .from("service_requests")
      .update({
        status: "resolved",
        resolution: data.resolution,
        work_performed: data.work_performed ?? null,
        parts_used: data.parts_used ?? null,
        meter_status_after: data.meter_status_after ?? null,
        final_reading: data.final_reading ?? null,
        resident_acknowledged: data.resident_acknowledged,
        completed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("vendor_id", vendorId);
    if (error) throw new Error(error.message);

    await supabase.from("service_request_events").insert({
      request_id: data.id,
      vendor_id: vendorId,
      actor_id: vendorId,
      event_type: "resolved",
      from_status: request.status,
      to_status: "resolved",
      note: data.resolution,
    });
    for (const [kind, path] of [
      ["before_photo", data.before_photo],
      ["after_photo", data.after_photo],
    ] as const) {
      if (!path) continue;
      await supabase.from("service_request_events").insert({
        request_id: data.id,
        vendor_id: vendorId,
        actor_id: vendorId,
        event_type: kind,
        storage_path: path,
      });
    }
    await logVendorAction(supabase, vendorId, "VENDOR_SERVICE_REQUEST_RESOLVED", {
      type: "service_request",
      id: data.id,
    }, { request_number: request.request_number });
    await notify(
      supabase,
      vendorId,
      "service_request_resolved",
      "Service request resolved",
      `${request.request_number} has been resolved.`,
      { type: "service_request", id: data.id },
    );
    return { ok: true };
  });

/* ------------------------------------------------------------------ *
 * Installation teams
 * ------------------------------------------------------------------ */

export const saveInstallationTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        name: z.string().trim().min(2, "Team name is required").max(120),
        leader_name: z.string().trim().max(120).optional(),
        phone: z.string().trim().max(30).optional(),
        description: z.string().trim().max(1000).optional(),
        status: z.enum(["active", "inactive"]).default("active"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const payload = {
      name: data.name,
      leader_name: data.leader_name || null,
      phone: data.phone || null,
      description: data.description || null,
      status: data.status,
    };

    if (data.id) {
      const { data: existing } = await supabase
        .from("installation_teams")
        .select("id")
        .eq("id", data.id)
        .eq("vendor_id", vendorId)
        .maybeSingle();
      if (!existing) throw new Error("Access denied");
      const { error } = await supabase
        .from("installation_teams")
        .update(payload)
        .eq("id", data.id)
        .eq("vendor_id", vendorId);
      if (error) throw new Error(error.message);
      await logVendorAction(supabase, vendorId, "VENDOR_INSTALLATION_TEAM_UPDATED", {
        type: "installation_team",
        id: data.id,
      }, { name: data.name });
      return { ok: true, id: data.id };
    }

    const { data: created, error } = await supabase
      .from("installation_teams")
      .insert({ ...payload, vendor_id: vendorId, created_by: vendorId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logVendorAction(supabase, vendorId, "VENDOR_INSTALLATION_TEAM_CREATED", {
      type: "installation_team",
      id: created.id,
    }, { name: data.name });
    return { ok: true, id: created.id as string };
  });

export const saveTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        team_id: uuid,
        user_id: uuid.nullable().optional(),
        name: z.string().trim().min(2, "Name is required").max(120),
        phone: z.string().trim().max(30).optional(),
        role: z.enum(MEMBER_ROLES).default("Installer"),
        status: z.enum(["active", "inactive"]).default("active"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const { data: team } = await supabase
      .from("installation_teams")
      .select("id")
      .eq("id", data.team_id)
      .eq("vendor_id", vendorId)
      .maybeSingle();
    if (!team) throw new Error("Access denied");

    const payload = {
      team_id: data.team_id,
      name: data.name,
      phone: data.phone || null,
      role: data.role,
      status: data.status,
      user_id: data.user_id ?? null,
    };
    if (data.id) {
      const { error } = await supabase
        .from("installation_team_members")
        .update(payload)
        .eq("id", data.id)
        .eq("vendor_id", vendorId);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: created, error } = await supabase
      .from("installation_team_members")
      .insert({ ...payload, vendor_id: vendorId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logVendorAction(supabase, vendorId, "VENDOR_INSTALLATION_TEAM_MEMBER_ADDED", {
      type: "installation_team",
      id: data.team_id,
    }, { name: data.name, role: data.role });
    return { ok: true, id: created.id as string };
  });

/* ------------------------------------------------------------------ *
 * Installation assignments
 * ------------------------------------------------------------------ */

export const scheduleInstallation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        meter_id: uuid,
        team_id: uuid,
        resident_id: uuid.nullable().optional(),
        zone_id: z.number().int().nullable().optional(),
        scheduled_date: z.string().trim().min(4, "Choose a date"),
        scheduled_time: z.string().trim().max(20).optional(),
        location: z.string().trim().max(200).optional(),
        notes: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const meter = await ownedMeter(supabase, vendorId, data.meter_id);

    const { data: team } = await supabase
      .from("installation_teams")
      .select("id, name, status")
      .eq("id", data.team_id)
      .eq("vendor_id", vendorId)
      .maybeSingle();
    if (!team) throw new Error("Access denied");
    if (team.status !== "active") throw new Error("That installation team is inactive");

    const { data: created, error } = await supabase
      .from("meter_installation_assignments")
      .insert({
        vendor_id: vendorId,
        meter_id: data.meter_id,
        team_id: data.team_id,
        resident_id: data.resident_id ?? null,
        zone_id: data.zone_id ?? null,
        scheduled_date: data.scheduled_date,
        scheduled_time: data.scheduled_time || null,
        location: data.location || null,
        notes: data.notes || null,
        status: "scheduled",
        assigned_by: vendorId,
      })
      .select("id, assignment_number")
      .single();
    if (error) throw new Error(error.message);

    await supabase
      .from("meters")
      .update({
        installation_status: "scheduled",
        installation_date: data.scheduled_date,
        installation_location: data.location || null,
        installer: team.name,
      })
      .eq("id", data.meter_id)
      .eq("vendor_id", vendorId);

    await logVendorAction(supabase, vendorId, "VENDOR_INSTALLATION_ASSIGNED", {
      type: "installation_assignment",
      id: created.id,
    }, { meter_number: meter.meter_number, team: team.name, scheduled_date: data.scheduled_date });
    await notify(
      supabase,
      vendorId,
      "installation_scheduled",
      "Installation scheduled",
      `${created.assignment_number}: meter ${meter.meter_number} scheduled for ${data.scheduled_date}.`,
      { type: "installation_assignment", id: created.id },
    );
    return { ok: true, id: created.id as string, assignment_number: created.assignment_number as string };
  });

export const updateInstallationAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        status: z.enum(ASSIGNMENT_STATUSES),
        scheduled_date: z.string().trim().max(40).nullable().optional(),
        scheduled_time: z.string().trim().max(20).nullable().optional(),
        installer_name: z.string().trim().max(120).optional(),
        location: z.string().trim().max(200).optional(),
        completion_reading: z.number().nonnegative().nullable().optional(),
        completion_notes: z.string().trim().max(1000).optional(),
        photo_paths: z.array(z.string().trim().max(400)).max(5).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const { data: assignment } = await supabase
      .from("meter_installation_assignments")
      .select("id, assignment_number, meter_id, status")
      .eq("id", data.id)
      .eq("vendor_id", vendorId)
      .maybeSingle();
    if (!assignment) throw new Error("Access denied");
    const meter = await ownedMeter(supabase, vendorId, assignment.meter_id);

    const completing = data.status === "completed";
    const patch: Record<string, unknown> = {
      status: data.status,
      installer_name: data.installer_name ?? null,
      completion_notes: data.completion_notes ?? null,
      completion_reading: data.completion_reading ?? null,
    };
    if (data.scheduled_date !== undefined) patch["scheduled_date"] = data.scheduled_date || null;
    if (data.scheduled_time !== undefined) patch["scheduled_time"] = data.scheduled_time || null;
    if (data.location !== undefined) patch["location"] = data.location || null;
    if (completing) patch["completed_at"] = new Date().toISOString();

    const { error } = await supabase
      .from("meter_installation_assignments")
      .update(patch)
      .eq("id", data.id)
      .eq("vendor_id", vendorId);
    if (error) throw new Error(error.message);

    const meterInstallation =
      data.status === "completed"
        ? "installed"
        : data.status === "failed"
          ? "failed"
          : data.status === "cancelled"
            ? "not_installed"
            : "scheduled";
    await supabase
      .from("meters")
      .update({
        installation_status: meterInstallation,
        installation_date: completing ? new Date().toISOString() : undefined,
        installation_notes: data.completion_notes ?? null,
        installer: data.installer_name ?? null,
      })
      .eq("id", assignment.meter_id)
      .eq("vendor_id", vendorId);

    for (const path of data.photo_paths ?? []) {
      await supabase.from("installation_attachments").insert({
        assignment_id: data.id,
        meter_id: assignment.meter_id,
        vendor_id: vendorId,
        kind: "installation_photo",
        storage_path: path,
        uploaded_by: vendorId,
      });
    }

    await logVendorAction(
      supabase,
      vendorId,
      completing ? "VENDOR_INSTALLATION_COMPLETED" : "VENDOR_INSTALLATION_UPDATED",
      { type: "installation_assignment", id: data.id },
      { meter_number: meter.meter_number, status: data.status },
    );
    await notify(
      supabase,
      vendorId,
      completing ? "installation_completed" : "installation_updated",
      completing ? "Installation completed" : "Installation updated",
      `${assignment.assignment_number}: meter ${meter.meter_number} is ${data.status.replace(/_/g, " ")}.`,
      { type: "installation_assignment", id: data.id },
    );
    if (completing) {
      await notify(
        supabase,
        vendorId,
        "meter_ready_for_activation",
        "Meter ready for activation",
        `Meter ${meter.meter_number} is installed and can now be activated.`,
        { type: "meter", id: assignment.meter_id },
      );
    }
    return { ok: true };
  });
