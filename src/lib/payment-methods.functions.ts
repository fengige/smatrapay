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

export type PaymentMethodRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  environment: string;
  is_configured: boolean;
  is_active: boolean;
  payment_type: "digital" | "offline";
  /** Storage object path in the payment-logos bucket. */
  logo_path: string | null;
  /** Short-lived signed URL for the logo, when one is stored. */
  logo_url: string | null;
  created_at: string;
  updated_at: string;
};

const methodInput = z.object({
  name: z.string().trim().min(2, "Payment method name is required").max(100),
  code: z
    .string()
    .trim()
    .min(2, "Payment method code is required")
    .max(50)
    .regex(/^[a-z0-9_-]+$/i, "Code may only contain letters, numbers, dashes and underscores"),
  description: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  is_active: z.boolean().optional().default(false),
  is_configured: z.boolean().optional().default(false),
  payment_type: z.enum(["digital", "offline"]).optional().default("digital"),
});

const methodUpdateInput = methodInput.extend({ id: z.string().uuid() });

function mapRow(r: any): PaymentMethodRow {
  return {
    id: r.id,
    name: r.name ?? "",
    code: r.code ?? "",
    description: r.description ?? null,
    environment: r.environment ?? "live",
    is_configured: Boolean(r.is_configured),
    is_active: Boolean(r.is_active),
    payment_type: (r.payment_type === "offline" ? "offline" : "digital") as "digital" | "offline",
    logo_path: r.logo_url ?? null,
    logo_url: null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export const listPaymentMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("payment_methods")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    const methods = ((data ?? []) as any[]).map(mapRow);
    const paths = methods.map((m) => m.logo_path).filter((p): p is string => !!p);
    if (paths.length) {
      const { data: signed } = await context.supabase.storage
        .from("payment-logos")
        .createSignedUrls(paths, 3600);
      const byPath = new Map(
        ((signed ?? []) as any[]).map((s: any) => [s.path as string, s.signedUrl as string]),
      );
      for (const m of methods) {
        if (m.logo_path) m.logo_url = byPath.get(m.logo_path) ?? null;
      }
    }
    return { methods };
  });

export const getPaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: row, error } = await context.supabase
      .from("payment_methods")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Payment method not found");
    return mapRow(row);
  });

export const addPaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => methodInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: inserted, error } = await context.supabase
      .from("payment_methods")
      .insert(data as never)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505")
        throw new Error("A payment method with this name or code already exists");
      throw new Error(error.message);
    }
    return { ok: true, id: inserted?.id as string };
  });

export const updatePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => methodUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { id, ...values } = data;
    const { error } = await context.supabase
      .from("payment_methods")
      .update(values as never)
      .eq("id", id);
    if (error) {
      if (error.code === "23505")
        throw new Error("A payment method with this name or code already exists");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const setPaymentMethodStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("payment_methods")
      .update({ is_active: data.is_active } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Saves (or clears) the storage path of a payment method logo. */
export const setPaymentMethodLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), path: z.string().trim().max(300).nullable() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("payment_methods")
      .update({ logo_url: data.path } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("payment_methods")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
