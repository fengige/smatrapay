import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createUserSchema } from "@/lib/user-schema";

/** Vendors never carry residency details, so those fields are dropped entirely. */
const vendorCreateSchema = createUserSchema.omit({
  property: true,
  building: true,
  unit_number: true,
  move_in_date: true,
  role: true,
});

const vendorUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().max(120).nullable().optional(),
  username: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["active", "inactive", "suspended", "pending"]).optional(),
});

export const createVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => vendorCreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can create vendors");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create vendor");

    const id = created.user.id;
    const { error: profileError } = await supabaseAdmin.from("users").upsert({
      id,
      name: data.name,
      email: data.email,
      username: data.username || null,
      phone: data.phone || null,
      bio: data.bio || null,
      notes: data.notes || null,
      status: data.status,
      created_by: userId,
      updated_by: userId,
    });
    if (profileError) throw new Error(profileError.message);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", id);
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: id, role: "vendor" });
    if (roleError) throw new Error(roleError.message);

    return { ok: true, id };
  });

export const updateVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => vendorUpdateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...fields } = data;
    const patch = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );

    const { error } = await supabase
      .from("users")
      .update({ ...patch, updated_by: userId })
      .eq("id", id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

/** Meters registered under a vendor account. */
export const listVendorMeters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vendorId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: meters, error } = await context.supabase
      .from("meters")
      .select("id, meter_number, serial_number, type, price_per_unit, status, unit_id, created_at")
      .eq("vendor_id", data.vendorId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { meters: meters ?? [] };
  });

/** Meters that are not yet registered to any vendor (available for assignment). */
export const listAssignableVendorMeters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ search: z.string().trim().max(120).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("meters")
      .select("id, meter_number, serial_number, type, status, vendor_id")
      .is("vendor_id", null)
      .order("meter_number", { ascending: true })
      .limit(200);

    const search = data.search?.trim();
    if (search) {
      query = query.or(`meter_number.ilike.%${search}%,serial_number.ilike.%${search}%`);
    }

    const { data: meters, error } = await query;
    if (error) throw new Error(error.message);
    return { meters: meters ?? [] };
  });

const assignSchema = z.object({
  vendorId: z.string().uuid(),
  meterIds: z.array(z.string().uuid()).min(1).max(500),
});

/** Register selected meters to an vendor. Only unassigned meters are accepted. */
export const assignMetersToVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => assignSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can assign meters");

    const { data: rows, error: readError } = await supabase
      .from("meters")
      .select("id, meter_number, vendor_id")
      .in("id", data.meterIds);
    if (readError) throw new Error(readError.message);

    const taken = (rows ?? []).filter((r) => r.vendor_id && r.vendor_id !== data.vendorId);
    const eligible = (rows ?? []).filter((r) => !r.vendor_id);

    if (eligible.length === 0) {
      throw new Error(
        taken.length > 0
          ? `Those meters are already registered to another vendor (${taken
              .map((r) => r.meter_number)
              .join(", ")})`
          : "No eligible meters to assign",
      );
    }

    const { error } = await supabase
      .from("meters")
      .update({ vendor_id: data.vendorId })
      .in(
        "id",
        eligible.map((r) => r.id),
      )
      .is("vendor_id", null);
    if (error) throw new Error(error.message);

    return {
      ok: true,
      assigned: eligible.length,
      skipped: taken.map((r) => r.meter_number),
    };
  });

/** Remove the vendor registration from selected meters. */
export const unassignMetersFromVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => assignSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can unassign meters");

    const { data: updated, error } = await supabase
      .from("meters")
      .update({ vendor_id: null })
      .in("id", data.meterIds)
      .eq("vendor_id", data.vendorId)
      .select("id");
    if (error) throw new Error(error.message);

    return { ok: true, unassigned: updated?.length ?? 0 };
  });
