import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { residentOwnsJob } from "@/lib/jobs-access";

/**
 * Jobs = existing service_requests. A job reaches a service provider through an
 * installation_team_members row linked to the provider's user account; assigning
 * a provider reuses (or creates) that row inside the vendor's "Service Providers" team.
 * Scope (admin / vendor / provider) is always derived from the session, never the client.
 */

const uuid = z.string().uuid();
type Ctx = { supabase: any; userId: string };
type Scope = { kind: "admin" } | { kind: "vendor"; vendorId: string } | { kind: "provider"; userId: string } | { kind: "resident"; userId: string };

async function hasRole(ctx: Ctx, role: string) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: role });
  return !!data;
}

async function resolveScope(ctx: Ctx, want: "staff" | "provider"): Promise<Scope> {
  if (want === "provider") {
    if (!(await hasRole(ctx, "service_provider"))) throw new Error("Service provider access required");
    return { kind: "provider", userId: ctx.userId };
  }
  if (await hasRole(ctx, "admin")) return { kind: "admin" };
  if (await hasRole(ctx, "vendor")) return { kind: "vendor", vendorId: ctx.userId };
  throw new Error("Access denied");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export const getResidentJobPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const isAdmin = await hasRole(ctx, "admin");
    const isVendor = await hasRole(ctx, "vendor");
    const isResident = await hasRole(ctx, "resident");
    if (!isAdmin && !isVendor && !isResident) throw new Error("Access denied");
    const sb = await admin();
    const { data: job } = await sb.from("service_requests").select("vendor_id, resident_id").eq("id", data.id).maybeSingle();
    if (!job || (!isAdmin && !(isVendor && job.vendor_id === ctx.userId) && !(isResident && job.resident_id === ctx.userId))) throw new Error("Job not found");
    const { data: events, error } = await sb.from("service_request_events").select("id, storage_path")
      .eq("request_id", data.id).eq("event_type", "resident_photo").order("created_at");
    if (error) throw new Error("Could not load photos");
    return Promise.all((events ?? []).map(async (event: { id: string; storage_path: string }) => {
      const { data: signed } = await sb.storage.from("meter-evidence").createSignedUrl(event.storage_path, 300);
      return { id: event.id, url: signed?.signedUrl as string | undefined };
    }));
  });

export const listInput = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["open", "assigned", "in_progress", "resolved", "closed", "cancelled"]).optional(),
  provider: uuid.optional(),
  unassigned: z.boolean().optional(),
  resident: uuid.optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(5).max(100).default(20),
});
type ListInput = z.infer<typeof listInput>;

export type JobRow = {
  id: string;
  request_number: string;
  issue_type: string;
  description: string | null;
  priority: string;
  status: string;
  preferred_date: string | null;
  created_at: string;
  completed_at: string | null;
  vendor_name: string | null;
  provider_id: string | null;
  provider_name: string | null;
  resident_name: string | null;
  meter_number: string | null;
  unit_number: string | null;
  property_name: string | null;
};

async function runList(scope: Scope, data: ListInput) {
  const sb = await admin();
  let memberFilter: string[] | null = null;
  if (scope.kind === "provider") {
    const { data: m } = await sb.from("installation_team_members").select("id").eq("user_id", scope.userId);
    const own: string[] = (m ?? []).map((r: any) => r.id);
    memberFilter = own;
    if (!own.length) return { rows: [] as JobRow[], total: 0 };
  }
  if (data.provider) {
    const { data: m } = await sb.from("installation_team_members").select("id").eq("user_id", data.provider);
    const ids = (m ?? []).map((r: any) => r.id);
    const next: string[] = memberFilter ? memberFilter.filter((i) => ids.includes(i)) : ids;
    memberFilter = next;
    if (!next.length) return { rows: [] as JobRow[], total: 0 };
  }

  let q = sb
    .from("service_requests")
    .select(
      "id, request_number, vendor_id, issue_type, description, priority, status, preferred_date, created_at, completed_at, technician_id, resident_id, meter_id",
      { count: "exact" },
    );
  if (scope.kind === "vendor") q = q.eq("vendor_id", scope.vendorId);
  if (scope.kind === "resident") q = q.eq("resident_id", scope.userId);
  if (memberFilter) q = q.in("technician_id", memberFilter);
  if (data.unassigned) q = q.is("technician_id", null);
  if (data.resident) q = q.eq("resident_id", data.resident);
  if (data.status) q = q.eq("status", data.status);
  if (data.from) q = q.gte("created_at", `${data.from}T00:00:00+03:00`);
  if (data.to) q = q.lte("created_at", `${data.to}T23:59:59.999+03:00`);
  if (data.q) {
    const t = `%${data.q.replace(/[,()%]/g, " ")}%`;
    q = q.or(`request_number.ilike.${t},issue_type.ilike.${t},description.ilike.${t}`);
  }
  const start = (data.page - 1) * data.limit;
  const { data: rows, error, count } = await q
    .order("created_at", { ascending: false })
    .range(start, start + data.limit - 1);
  if (error) throw new Error(error.message);
  const list = (rows ?? []) as any[];

  const uniq = (xs: any[]) => [...new Set(xs.filter(Boolean))] as string[];
  const techIds = uniq(list.map((r) => r.technician_id));
  const meterIds = uniq(list.map((r) => r.meter_id));
  const [{ data: techs }, { data: meters }] = await Promise.all([
    techIds.length ? sb.from("installation_team_members").select("id, user_id, name").in("id", techIds) : { data: [] },
    meterIds.length ? sb.from("meters").select("id, meter_number, unit_id").in("id", meterIds) : { data: [] },
  ]);
  const userIds = uniq([
    ...list.map((r) => r.resident_id),
    ...list.map((r) => r.vendor_id),
    ...(techs ?? []).map((t: any) => t.user_id),
  ]);
  const unitIds = uniq((meters ?? []).map((m: any) => m.unit_id));
  const [{ data: users }, { data: units }] = await Promise.all([
    userIds.length ? sb.from("users").select("id, name").in("id", userIds) : { data: [] },
    unitIds.length ? sb.from("units").select("id, unit_number, property_id").in("id", unitIds) : { data: [] },
  ]);
  const propIds = uniq((units ?? []).map((u: any) => u.property_id));
  const { data: props } = propIds.length
    ? await sb.from("properties").select("id, name").in("id", propIds)
    : { data: [] };

  const by = (xs: any[] | null) => new Map((xs ?? []).map((x: any) => [x.id, x]));
  const T = by(techs), M = by(meters), U = by(users), N = by(units), P = by(props);
  return {
    total: count ?? 0,
    rows: list.map((r): JobRow => {
      const tech: any = r.technician_id ? T.get(r.technician_id) : null;
      const meter: any = r.meter_id ? M.get(r.meter_id) : null;
      const unit: any = meter?.unit_id ? N.get(meter.unit_id) : null;
      return {
        id: r.id,
        request_number: r.request_number,
        issue_type: r.issue_type,
        description: r.description ?? null,
        priority: r.priority,
        status: r.status,
        preferred_date: r.preferred_date ?? null,
        created_at: r.created_at,
        completed_at: r.completed_at ?? null,
        vendor_name: (U.get(r.vendor_id) as any)?.name ?? null,
        provider_id: tech?.user_id ?? null,
        provider_name: tech ? ((tech.user_id && (U.get(tech.user_id) as any)?.name) || tech.name) : null,
        resident_name: r.resident_id ? ((U.get(r.resident_id) as any)?.name ?? null) : null,
        meter_number: meter?.meter_number ?? null,
        unit_number: unit?.unit_number ?? null,
        property_name: unit?.property_id ? ((P.get(unit.property_id) as any)?.name ?? null) : null,
      };
    }),
  };
}

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInput.parse(d))
  .handler(async ({ data, context }) => runList(await resolveScope(context as Ctx, "staff"), data));

export const listMyJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInput.omit({ provider: true, unassigned: true, resident: true }).parse(d))
  .handler(async ({ data, context }) => runList(await resolveScope(context as Ctx, "provider"), data));

export const listCustomerJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInput.omit({ provider: true, unassigned: true, resident: true }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (!(await hasRole(ctx, "resident"))) throw new Error("Resident access required");
    return runList({ kind: "resident", userId: ctx.userId }, data);
  });

export const getCustomerJobUpdates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (!(await hasRole(ctx, "resident"))) throw new Error("Resident access required");
    const sb = await admin();
    const { data: job } = await sb.from("service_requests").select("resident_id")
      .eq("id", data.id).eq("resident_id", ctx.userId).maybeSingle();
    if (!residentOwnsJob(ctx.userId, job)) throw new Error("Job not found");
    const { data: events, error } = await sb.from("service_request_events")
      .select("id, event_type, to_status, note, actor_id, created_at")
      .eq("request_id", data.id).in("event_type", ["status_changed", "status_change", "resolved", "technician_assigned"])
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    const actorIds = [...new Set((events ?? []).map((e: any) => e.actor_id).filter(Boolean))];
    const { data: roles } = actorIds.length
      ? await sb.from("user_roles").select("user_id").in("user_id", actorIds).eq("role", "service_provider")
      : { data: [] };
    const providers = new Set((roles ?? []).map((r: any) => r.user_id));
    // Never disclose staff/internal notes or SMS failures to residents.
    return { updates: (events ?? []).map((e: any): { id: string; created_at: string; status: string | null; assigned: boolean; note: string | null } => ({
      id: e.id as string, created_at: e.created_at as string,
      status: e.to_status as string | null,
      assigned: e.event_type === "technician_assigned",
      note: e.event_type === "status_changed" && providers.has(e.actor_id) ? e.note as string | null : null,
    })) };
  });

/** Staff-facing job timeline: full event history for a job the caller is allowed to see. */
export const getJobUpdates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const scope = await resolveScope(ctx, "staff");
    const sb = await admin();
    const { data: job } = await sb.from("service_requests").select("id, vendor_id")
      .eq("id", data.id).maybeSingle();
    if (!job || (scope.kind === "vendor" && job.vendor_id !== scope.vendorId)) {
      throw new Error("Job not found");
    }
    const { data: events, error } = await sb.from("service_request_events")
      .select("id, event_type, from_status, to_status, note, created_at")
      .eq("request_id", data.id)
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return {
      updates: (events ?? []).map((e: any) => ({
        id: e.id as string,
        created_at: e.created_at as string,
        status: e.to_status as string | null,
        assigned: e.event_type === "technician_assigned",
        note: e.note as string | null,
      })),
    };
  });

/** Active, non-deleted service providers with their offered services. */
export const listAssignableProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await resolveScope(context as Ctx, "staff");
    const sb = await admin();
    const { data: roles } = await sb.from("user_roles").select("user_id").eq("role", "service_provider");
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (!ids.length) return { providers: [] };
    const [{ data: users }, { data: profiles }, { data: services }] = await Promise.all([
      sb.from("users").select("id, name, phone, status").in("id", ids).eq("status", "active"),
      sb.from("service_provider_profiles").select("user_id, business_name, deleted_at").in("user_id", ids),
      sb.from("service_provider_services").select("provider_id, service_name").in("provider_id", ids).eq("status", "active"),
    ]);
    const deleted = new Set((profiles ?? []).filter((p: any) => p.deleted_at).map((p: any) => p.user_id));
    return {
      providers: ((users ?? []) as any[])
        .filter((u) => !deleted.has(u.id))
        .map((u) => ({
          id: u.id as string,
          name: (u.name as string) ?? "Unnamed",
          business_name: ((profiles ?? []) as any[]).find((p) => p.user_id === u.id)?.business_name ?? null,
          services: ((services ?? []) as any[]).filter((s) => s.provider_id === u.id).map((s) => s.service_name as string),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

export const assignJobToProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, provider_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const scope = await resolveScope(ctx, "staff");
    const sb = await admin();

    const { data: request } = await sb
      .from("service_requests")
      .select("id, request_number, vendor_id, status")
      .eq("id", data.id)
      .maybeSingle();
    // Same message for missing and foreign jobs so vendors can't probe other vendors' records.
    if (!request || (scope.kind === "vendor" && request.vendor_id !== scope.vendorId)) {
      throw new Error("Job not found");
    }
    if (["resolved", "closed", "cancelled"].includes(request.status)) {
      throw new Error("This job is already finished and can't be reassigned");
    }

    const [{ data: role }, { data: user }, { data: profile }] = await Promise.all([
      sb.from("user_roles").select("user_id").eq("user_id", data.provider_id).eq("role", "service_provider").maybeSingle(),
      sb.from("users").select("id, name, phone, status").eq("id", data.provider_id).maybeSingle(),
      sb.from("service_provider_profiles").select("deleted_at").eq("user_id", data.provider_id).maybeSingle(),
    ]);
    if (!role || !user || profile?.deleted_at) throw new Error("Service provider not found");
    if (user.status !== "active") throw new Error("This service provider is suspended and cannot receive new jobs");

    const vendorId = request.vendor_id as string;
    let { data: member } = await sb
      .from("installation_team_members")
      .select("id, team_id")
      .eq("vendor_id", vendorId)
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (!member) {
      let { data: team } = await sb
        .from("installation_teams")
        .select("id")
        .eq("vendor_id", vendorId)
        .eq("name", "Service Providers")
        .maybeSingle();
      if (!team) {
        const ins = await sb
          .from("installation_teams")
          .insert({ vendor_id: vendorId, name: "Service Providers", description: "Service providers assigned to jobs", created_by: ctx.userId })
          .select("id")
          .single();
        if (ins.error) throw new Error(ins.error.message);
        team = ins.data;
      }
      const mi = await sb
        .from("installation_team_members")
        .insert({ team_id: team!.id, vendor_id: vendorId, user_id: user.id, name: user.name ?? "Service provider", phone: user.phone, role: "technician" })
        .select("id, team_id")
        .single();
      if (mi.error) throw new Error(mi.error.message);
      member = mi.data;
    }

    const toStatus = request.status === "open" ? "assigned" : request.status;
    const { error } = await sb
      .from("service_requests")
      .update({ technician_id: member!.id, team_id: member!.team_id, assigned_at: new Date().toISOString(), status: toStatus })
      .eq("id", request.id);
    if (error) throw new Error(error.message);

    await sb.from("service_request_events").insert({
      request_id: request.id,
      vendor_id: vendorId,
      actor_id: ctx.userId,
      event_type: "technician_assigned",
      from_status: request.status,
      to_status: toStatus,
      note: `Assigned to ${user.name ?? "service provider"}${scope.kind === "admin" ? " by admin" : ""}`,
    });
    await sb.from("notifications").insert({
      user_id: user.id,
      type: "service_request_assigned",
      title: "New job assigned",
      message: `${request.request_number} has been assigned to you.`,
    }).then(() => undefined, () => undefined);
    if (scope.kind === "vendor") {
      const { logVendorAction } = await import("@/lib/vendor.server");
      await logVendorAction(ctx.supabase, vendorId, "VENDOR_SERVICE_REQUEST_ASSIGNED", { type: "service_request", id: request.id }, { provider: user.name });
    }
    return { ok: true };
  });

/** Pre-defined services that providers pick from. */
export const listServiceCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context as Ctx).supabase
      .from("service_catalog")
      .select("id, name, description")
      .eq("status", "active")
      .order("name");
    if (error) throw new Error(error.message);
    return { services: (data ?? []) as { id: string; name: string; description: string }[] };
  });

/** Allowed provider moves on their own jobs. "Completed" maps to the existing "resolved" status. */
export const PROVIDER_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["resolved", "cancelled"],
};

export const updateMyJobStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        status: z.enum(["in_progress", "resolved", "cancelled"]),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await resolveScope(ctx, "provider");
    const sb = await admin();
    const { data: m } = await sb.from("installation_team_members").select("id").eq("user_id", ctx.userId);
    const mine = (m ?? []).map((r: any) => r.id as string);
    const { data: job } = await sb
      .from("service_requests")
      .select("id, request_number, vendor_id, resident_id, meter_id, status, technician_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!job || !mine.includes(job.technician_id)) throw new Error("Job not found");
    if (!(PROVIDER_TRANSITIONS[job.status] ?? []).includes(data.status)) {
      throw new Error(`A ${job.status.replace(/_/g, " ")} job can't be moved to ${data.status.replace(/_/g, " ")}`);
    }
    const now = new Date().toISOString();
    const { data: changed, error } = await sb
      .from("service_requests")
      .update({
        status: data.status,
        ...(data.status === "resolved" ? { completed_at: now, ...(data.note ? { resolution: data.note } : {}) } : {}),
      })
      .eq("id", job.id)
      .eq("status", job.status)
      .eq("technician_id", job.technician_id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!changed) throw new Error("This job changed already. Refresh My Jobs before updating it.");

    const label = { in_progress: "In Progress", resolved: "Completed", cancelled: "Cancelled" }[data.status];
    const eventId = crypto.randomUUID();
    await sb.from("service_request_events").insert({
      id: eventId,
      request_id: job.id,
      vendor_id: job.vendor_id,
      actor_id: ctx.userId,
      event_type: "status_changed",
      from_status: job.status,
      to_status: data.status,
      note: data.note || `Service provider marked the job ${label}`,
    });
    const recipients = [job.vendor_id, job.resident_id].filter(Boolean) as string[];
    if (recipients.length) {
      await sb.from("notifications").insert(
        recipients.map((user_id) => ({
          user_id,
          type: "service_request_status",
          title: `Job ${label}`,
          message: `${job.request_number} is now ${label}.`,
          resource_type: "service_request",
          resource_id: job.id,
        })),
      );
    }
    const { sendJobStatusSms } = await import("@/lib/job-status-sms.server");
    const sms = await sendJobStatusSms(sb, job, data.status, ctx.userId, eventId);
    return { ok: true, sms };
  });
