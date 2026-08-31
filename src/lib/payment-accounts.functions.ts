import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Admin access required");
}

export type PaymentUserType = "landlord" | "agent" | "vendor";

export type PaymentAccountRow = {
  id: string;
  payment_method_id: string;
  payment_method_name: string;
  payment_method_code: string;
  user_id: string;
  user_type: PaymentUserType;
  user_name: string;
  account_name: string | null;
  account_number: string;
  account_number_masked: string;
  bank_name: string | null;
  branch: string | null;
  paybill_number: string | null;
  details: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export function maskAccountNumber(value: string): string {
  const v = (value ?? "").trim();
  if (v.length <= 4) return "•".repeat(Math.max(v.length - 1, 0)) + v.slice(-1);
  return "•".repeat(Math.max(v.length - 4, 3)) + v.slice(-4);
}

const accountInput = z.object({
  payment_method_id: z.string().uuid("Payment method is required"),
  user_type: z.enum(["landlord", "agent", "vendor"], {
    message: "User type is required",
  }),
  user_id: z.string().uuid("User is required"),
  account_name: z.string().trim().max(150).optional().nullable(),
  account_number: z
    .string()
    .trim()
    .min(4, "Account number / phone number is required")
    .max(60)
    .regex(/^[0-9+\-\s]+$/, "Account number may only contain digits, spaces, + and -"),
  bank_name: z.string().trim().max(150).optional().nullable(),
  branch: z.string().trim().max(150).optional().nullable(),
  paybill_number: z.string().trim().max(60).optional().nullable(),
  details: z.string().trim().max(500).optional().nullable(),
  is_active: z.boolean().optional().default(true),
  is_default: z.boolean().optional().default(false),
});

const accountUpdateInput = accountInput.extend({ id: z.string().uuid() });

function clean(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function mapAccount(r: any): PaymentAccountRow {
  const number = r.account_number ?? "";
  return {
    id: r.id,
    payment_method_id: r.payment_method_id,
    payment_method_name: r.payment_methods?.name ?? "—",
    payment_method_code: r.payment_methods?.code ?? "",
    user_id: r.user_id,
    user_type: r.user_type,
    user_name: r.users?.name || r.users?.email || "—",
    account_name: r.account_name ?? null,
    account_number: number,
    account_number_masked: maskAccountNumber(number),
    bank_name: r.bank_name ?? null,
    branch: r.branch ?? null,
    paybill_number: r.paybill_number ?? null,
    details: r.details ?? null,
    is_active: Boolean(r.is_active),
    is_default: Boolean(r.is_default),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

const SELECT =
  "*, payment_methods:payment_method_id(name, code), users:user_id(name, email)";

/** Lists users holding one of the payment-capable roles. */
export const listPaymentUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_type: z.enum(["landlord", "agent", "vendor"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: roleRows, error: roleError } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", data.user_type);
    if (roleError) throw new Error(roleError.message);
    const ids = (roleRows ?? []).map((r: any) => r.user_id as string);
    if (!ids.length) return { users: [] as { id: string; name: string }[] };
    const { data: users, error } = await context.supabase
      .from("users")
      .select("id, name, email")
      .in("id", ids)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      users: ((users ?? []) as any[]).map((u) => ({
        id: u.id as string,
        name: (u.name || u.email || "Unnamed user") as string,
      })),
    };
  });

export const listPaymentAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("payment_method_accounts")
      .select(SELECT)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { accounts: ((data ?? []) as any[]).map(mapAccount) };
  });

async function assertUserHasRole(
  context: { supabase: any },
  userId: string,
  role: PaymentUserType,
) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`The selected user is not a ${role}`);
}

function rolePayload(user_type: PaymentUserType, user_id: string) {
  return {
    landlord_id: user_type === "landlord" ? user_id : null,
    agent_id: user_type === "agent" ? user_id : null,
    vendor_id: user_type === "vendor" ? user_id : null,
  };
}

async function clearOtherDefaults(
  context: { supabase: any },
  args: { user_id: string; payment_method_id: string; exceptId?: string },
) {
  let q = context.supabase
    .from("payment_method_accounts")
    .update({ is_default: false } as never)
    .eq("user_id", args.user_id)
    .eq("payment_method_id", args.payment_method_id)
    .eq("is_default", true);
  if (args.exceptId) q = q.neq("id", args.exceptId);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export const addPaymentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => accountInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    await assertUserHasRole(context as never, data.user_id, data.user_type);

    if (data.is_default) {
      await clearOtherDefaults(context as never, {
        user_id: data.user_id,
        payment_method_id: data.payment_method_id,
      });
    }

    const { data: inserted, error } = await context.supabase
      .from("payment_method_accounts")
      .insert({
        payment_method_id: data.payment_method_id,
        user_id: data.user_id,
        user_type: data.user_type,
        ...rolePayload(data.user_type, data.user_id),
        account_name: clean(data.account_name),
        account_number: data.account_number.trim(),
        bank_name: clean(data.bank_name),
        branch: clean(data.branch),
        paybill_number: clean(data.paybill_number),
        details: clean(data.details),
        is_active: data.is_active,
        is_default: data.is_default,
        created_by: context.userId,
        updated_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505")
        throw new Error("This account number is already saved for this user and payment method");
      throw new Error(error.message);
    }
    return { ok: true, id: inserted?.id as string };
  });

export const updatePaymentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => accountUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    await assertUserHasRole(context as never, data.user_id, data.user_type);

    if (data.is_default) {
      await clearOtherDefaults(context as never, {
        user_id: data.user_id,
        payment_method_id: data.payment_method_id,
        exceptId: data.id,
      });
    }

    const { error } = await context.supabase
      .from("payment_method_accounts")
      .update({
        payment_method_id: data.payment_method_id,
        user_id: data.user_id,
        user_type: data.user_type,
        ...rolePayload(data.user_type, data.user_id),
        account_name: clean(data.account_name),
        account_number: data.account_number.trim(),
        bank_name: clean(data.bank_name),
        branch: clean(data.branch),
        paybill_number: clean(data.paybill_number),
        details: clean(data.details),
        is_active: data.is_active,
        is_default: data.is_default,
        updated_by: context.userId,
      } as never)
      .eq("id", data.id);
    if (error) {
      if (error.code === "23505")
        throw new Error("This account number is already saved for this user and payment method");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const setPaymentAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("payment_method_accounts")
      .update({ is_active: data.is_active, updated_by: context.userId } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDefaultPaymentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: row, error: readError } = await context.supabase
      .from("payment_method_accounts")
      .select("id, user_id, payment_method_id")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) throw new Error("Payment account not found");

    await clearOtherDefaults(context as never, {
      user_id: (row as any).user_id,
      payment_method_id: (row as any).payment_method_id,
      exceptId: data.id,
    });
    const { error } = await context.supabase
      .from("payment_method_accounts")
      .update({ is_default: true, updated_by: context.userId } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePaymentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("payment_method_accounts")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
