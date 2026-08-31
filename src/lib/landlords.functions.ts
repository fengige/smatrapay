import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createUserSchema } from "@/lib/user-schema";
import { assignmentHistorySchema } from "@/lib/assignment-history";

/** Landlords never carry residency details, so those fields are dropped entirely. */
const landlordCreateSchema = createUserSchema.omit({
  property: true,
  building: true,
  unit_number: true,
  move_in_date: true,
  role: true,
});

const landlordUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().max(120).nullable().optional(),
  username: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["active", "inactive", "suspended", "pending"]).optional(),
  profile_image: z.string().trim().max(1000).nullable().optional(),
});

export const createLandlord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => landlordCreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can create landlords");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create landlord");

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
      .insert({ user_id: id, role: "landlord" });
    if (roleError) throw new Error(roleError.message);

    return { ok: true, id };
  });

export const updateLandlord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => landlordUpdateSchema.parse(data))
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

/** Meters currently assigned to this landlord. */
export const listLandlordMeters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ landlordId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("meters")
      .select("id, meter_number, serial_number, type, status, price_per_unit")
      .eq("landlord_id", data.landlordId)
      .order("meter_number", { ascending: true });
    if (error) throw new Error(error.message);
    return { meters: rows ?? [] };
  });

/** Assignment history: who registered/unassigned which meter to this landlord and when. */
export const listLandlordAssignmentHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => assignmentHistorySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { buildAssignmentHistory } = await import("@/lib/assignment-history.server");
    return buildAssignmentHistory(context.supabase, "landlord_id", data);
  });
