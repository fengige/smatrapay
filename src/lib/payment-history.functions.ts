import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { maskAccountNumber, type PaymentUserType } from "@/lib/payment-accounts.functions";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Admin access required");
}

export type PaymentStatus = "pending" | "completed" | "failed" | "cancelled";

export type PaymentRow = {
  id: string;
  payee_type: PaymentUserType;
  payee_id: string;
  payee_name: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  reference: string | null;
  description: string | null;
  paid_at: string | null;
  created_at: string;
  method_name: string | null;
  account_label: string | null;
};

export type PaymentGroup = {
  kind: PaymentUserType;
  payee_id: string;
  payee_name: string;
  pending_amount: number;
  completed_amount: number;
  count: number;
  payments: PaymentRow[];
};

const filters = z.object({
  status: z.enum(["all", "pending", "completed", "failed", "cancelled"]).default("all"),
  kind: z.enum(["all", "landlord", "agent", "vendor"]).default("all"),
  q: z.string().trim().max(120).optional().default(""),
});

/** All payments grouped by landlord / agent / vendor, with method and account used. */
export const listPaymentHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filters.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;

    let query = supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.kind !== "all") query = query.eq("payee_type", data.kind);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];

    const payeeIds = [...new Set(list.map((r) => r.payee_id))];
    const methodIds = [...new Set(list.map((r) => r.payment_method_id).filter(Boolean))];
    const accountIds = [...new Set(list.map((r) => r.payment_account_id).filter(Boolean))];

    const [users, methods, accounts] = await Promise.all([
      payeeIds.length
        ? supabase.from("users").select("id, name, email").in("id", payeeIds)
        : Promise.resolve({ data: [] }),
      methodIds.length
        ? supabase.from("payment_methods").select("id, name").in("id", methodIds)
        : Promise.resolve({ data: [] }),
      accountIds.length
        ? supabase
            .from("payment_method_accounts")
            .select("id, account_name, account_number, bank_name")
            .in("id", accountIds)
        : Promise.resolve({ data: [] }),
    ]);

    const nameById = new Map<string, string>(
      ((users.data ?? []) as any[]).map((u) => [u.id, u.name ?? u.email ?? "Unknown"]),
    );
    const methodById = new Map<string, string>(
      ((methods.data ?? []) as any[]).map((m) => [m.id, m.name]),
    );
    const accountById = new Map<string, string>(
      ((accounts.data ?? []) as any[]).map((a) => [
        a.id,
        [a.account_name, a.bank_name, maskAccountNumber(a.account_number ?? "")]
          .filter(Boolean)
          .join(" · "),
      ]),
    );

    const term = (data.q ?? "").toLowerCase();
    const mapped: PaymentRow[] = list
      .map((r) => ({
        id: r.id,
        payee_type: r.payee_type as PaymentUserType,
        payee_id: r.payee_id,
        payee_name: nameById.get(r.payee_id) ?? "Unknown",
        amount: Number(r.amount ?? 0),
        currency: r.currency ?? "KES",
        status: r.status as PaymentStatus,
        reference: r.reference ?? null,
        description: r.description ?? null,
        paid_at: r.paid_at ?? null,
        created_at: r.created_at,
        method_name: r.payment_method_id ? (methodById.get(r.payment_method_id) ?? null) : null,
        account_label: r.payment_account_id
          ? (accountById.get(r.payment_account_id) ?? null)
          : null,
      }))
      .filter((r) =>
        term
          ? [r.payee_name, r.reference, r.description, r.method_name, r.account_label]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(term))
          : true,
      );

    const groupMap = new Map<string, PaymentGroup>();
    for (const p of mapped) {
      const key = `${p.payee_type}:${p.payee_id}`;
      let g = groupMap.get(key);
      if (!g) {
        g = {
          kind: p.payee_type,
          payee_id: p.payee_id,
          payee_name: p.payee_name,
          pending_amount: 0,
          completed_amount: 0,
          count: 0,
          payments: [],
        };
        groupMap.set(key, g);
      }
      g.count += 1;
      if (p.status === "pending") g.pending_amount += p.amount;
      if (p.status === "completed") g.completed_amount += p.amount;
      g.payments.push(p);
    }

    const groups = [...groupMap.values()].sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) || b.pending_amount - a.pending_amount ||
        a.payee_name.localeCompare(b.payee_name),
    );

    const totals = {
      pending: mapped.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0),
      completed: mapped.filter((p) => p.status === "completed").reduce((s, p) => s + p.amount, 0),
      count: mapped.length,
      payees: groups.length,
    };

    return { groups, payments: mapped, totals };
  });

const createInput = z.object({
  payee_type: z.enum(["landlord", "agent", "vendor"]),
  payee_id: z.string().uuid("Select who is being paid"),
  payment_method_id: z.string().uuid().optional().nullable(),
  payment_account_id: z.string().uuid().optional().nullable(),
  amount: z.number().positive("Amount must be greater than zero"),
  currency: z.string().trim().min(1).max(8).default("KES"),
  status: z.enum(["pending", "completed", "failed", "cancelled"]).default("pending"),
  reference: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
});

export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await (context.supabase as any).from("payments").insert({
      ...data,
      paid_at: data.status === "completed" ? new Date().toISOString() : null,
      created_by: context.userId,
      updated_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "completed", "failed", "cancelled"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await (context.supabase as any)
      .from("payments")
      .update({
        status: data.status,
        paid_at: data.status === "completed" ? new Date().toISOString() : null,
        updated_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Landlords, agents and vendors that can receive payments. */
export const listPayees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["landlord", "agent", "vendor"]);
    if (error) throw new Error(error.message);
    const ids = [...new Set(((roles ?? []) as any[]).map((r) => r.user_id))];
    if (!ids.length) return { payees: [] as { id: string; name: string; type: PaymentUserType }[] };
    const { data: users } = await supabase.from("users").select("id, name, email").in("id", ids);
    const nameById = new Map<string, string>(
      ((users ?? []) as any[]).map((u) => [u.id, u.name ?? u.email ?? "Unknown"]),
    );
    return {
      payees: ((roles ?? []) as any[]).map((r) => ({
        id: r.user_id as string,
        name: nameById.get(r.user_id) ?? "Unknown",
        type: r.role as PaymentUserType,
      })),
    };
  });
