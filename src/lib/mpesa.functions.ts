import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Admin access required");
}

const environmentSchema = z.enum(["sandbox", "production"]);
/** null / omitted = the shared platform-wide configuration. */
const ownerSchema = z.string().uuid().nullable().optional();

/** Scopes a query to a specific owner's config, or the shared one. */
function scopeOwner(query: any, ownerId: string | null | undefined) {
  return ownerId ? query.eq("owner_id", ownerId) : query.is("owner_id", null);
}

/** Public base URL used to build the Daraja callback endpoints. */
function appBaseUrl(): string {
  try {
    const origin = getRequestHeader("origin");
    if (origin) return origin.replace(/\/$/, "");
    const host = getRequestHeader("host");
    if (host) return `https://${host}`;
  } catch {
    /* ignore */
  }
  return "https://smatrapay.lovable.app";
}

export function mpesaCallbackUrls(base: string) {
  return {
    stk_callback_url: `${base}/api/public/mpesa/stk-callback`,
    c2b_validation_url: `${base}/api/public/mpesa/c2b-validation`,
    c2b_confirmation_url: `${base}/api/public/mpesa/c2b-confirmation`,
    b2c_result_url: `${base}/api/public/mpesa/b2c-result`,
    b2c_queue_timeout_url: `${base}/api/public/mpesa/b2c-timeout`,
  };
}

export type MpesaConfigView = {
  payment_method_id: string;
  owner_id: string | null;
  environment: "sandbox" | "production";
  enabled: boolean;
  country: string;
  currency: string;
  consumer_key: string;
  business_short_code: string;
  transaction_type: string;
  account_reference: string;
  transaction_desc: string;
  stk_enabled: boolean;
  c2b_enabled: boolean;
  c2b_short_code: string;
  c2b_response_type: string;
  b2c_enabled: boolean;
  b2c_initiator_name: string;
  b2c_short_code: string;
  b2c_occasion: string;
  b2c_remarks: string;
  /** Secrets are never returned; only whether one is stored. */
  has_consumer_secret: boolean;
  has_passkey: boolean;
  has_b2c_security_credential: boolean;
  updated_at: string | null;
  urls: ReturnType<typeof mpesaCallbackUrls>;
};

function toView(
  paymentMethodId: string,
  environment: "sandbox" | "production",
  row: any | null,
  base: string,
  ownerId: string | null = null,
): MpesaConfigView {
  return {
    payment_method_id: paymentMethodId,
    owner_id: ownerId,
    environment,
    enabled: Boolean(row?.enabled),
    country: row?.country ?? "KE",
    currency: row?.currency ?? "KES",
    consumer_key: row?.consumer_key ?? "",
    business_short_code: row?.business_short_code ?? "",
    transaction_type: row?.transaction_type ?? "CustomerPayBillOnline",
    account_reference: row?.account_reference ?? "",
    transaction_desc: row?.transaction_desc ?? "",
    stk_enabled: row ? Boolean(row.stk_enabled) : true,
    c2b_enabled: Boolean(row?.c2b_enabled),
    c2b_short_code: row?.c2b_short_code ?? "",
    c2b_response_type: row?.c2b_response_type ?? "Completed",
    b2c_enabled: Boolean(row?.b2c_enabled),
    b2c_initiator_name: row?.b2c_initiator_name ?? "",
    b2c_short_code: row?.b2c_short_code ?? "",
    b2c_occasion: row?.b2c_occasion ?? "",
    b2c_remarks: row?.b2c_remarks ?? "",
    has_consumer_secret: Boolean(row?.consumer_secret),
    has_passkey: Boolean(row?.passkey),
    has_b2c_security_credential: Boolean(row?.b2c_security_credential),
    updated_at: row?.updated_at ?? null,
    urls: mpesaCallbackUrls(base),
  };
}

export const getMpesaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        payment_method_id: z.string().uuid(),
        environment: environmentSchema,
        owner_id: ownerSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: row, error } = await scopeOwner(
      context.supabase
        .from("payment_method_configurations")
        .select("*")
        .eq("payment_method_id", data.payment_method_id)
        .eq("environment", data.environment),
      data.owner_id,
    ).maybeSingle();
    if (error) throw new Error(error.message);
    return toView(
      data.payment_method_id,
      data.environment,
      row,
      appBaseUrl(),
      data.owner_id ?? null,
    );
  });

const saveInput = z.object({
  payment_method_id: z.string().uuid(),
  environment: environmentSchema,
  owner_id: ownerSchema,
  enabled: z.boolean(),
  country: z.string().trim().min(2).max(4).default("KE"),
  currency: z.string().trim().min(3).max(4).default("KES"),
  consumer_key: z.string().trim().max(200).default(""),
  /** Empty string means "keep the stored secret". */
  consumer_secret: z.string().max(500).default(""),
  business_short_code: z.string().trim().max(20).default(""),
  passkey: z.string().max(500).default(""),
  transaction_type: z.enum(["CustomerPayBillOnline", "CustomerBuyGoodsOnline"]),
  account_reference: z.string().trim().max(50).default(""),
  transaction_desc: z.string().trim().max(100).default(""),
  stk_enabled: z.boolean(),
  c2b_enabled: z.boolean(),
  c2b_short_code: z.string().trim().max(20).default(""),
  c2b_response_type: z.enum(["Completed", "Cancelled"]),
  b2c_enabled: z.boolean(),
  b2c_initiator_name: z.string().trim().max(100).default(""),
  b2c_security_credential: z.string().max(2000).default(""),
  b2c_short_code: z.string().trim().max(20).default(""),
  b2c_occasion: z.string().trim().max(100).default(""),
  b2c_remarks: z.string().trim().max(200).default(""),
});

export const saveMpesaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);

    if (data.enabled) {
      const missing: string[] = [];
      if (!data.consumer_key) missing.push("Consumer Key");
      if (!data.business_short_code) missing.push("Business Short Code");
      if (missing.length) throw new Error(`Please provide: ${missing.join(", ")}`);
    }

    const { data: existing } = await scopeOwner(
      context.supabase
        .from("payment_method_configurations")
        .select("id, consumer_secret, passkey, b2c_security_credential")
        .eq("payment_method_id", data.payment_method_id)
        .eq("environment", data.environment),
      data.owner_id,
    ).maybeSingle();

    const payload: Record<string, unknown> = {
      payment_method_id: data.payment_method_id,
      environment: data.environment,
      owner_id: data.owner_id ?? null,
      enabled: data.enabled,
      country: data.country,
      currency: data.currency,
      consumer_key: data.consumer_key || null,
      business_short_code: data.business_short_code || null,
      transaction_type: data.transaction_type,
      account_reference: data.account_reference || null,
      transaction_desc: data.transaction_desc || null,
      stk_enabled: data.stk_enabled,
      c2b_enabled: data.c2b_enabled,
      c2b_short_code: data.c2b_short_code || null,
      c2b_response_type: data.c2b_response_type,
      b2c_enabled: data.b2c_enabled,
      b2c_initiator_name: data.b2c_initiator_name || null,
      b2c_short_code: data.b2c_short_code || null,
      b2c_occasion: data.b2c_occasion || null,
      b2c_remarks: data.b2c_remarks || null,
      consumer_secret: data.consumer_secret || (existing?.consumer_secret ?? null),
      passkey: data.passkey || (existing?.passkey ?? null),
      b2c_security_credential:
        data.b2c_security_credential || (existing?.b2c_security_credential ?? null),
    };

    if (existing?.id) {
      const { error } = await context.supabase
        .from("payment_method_configurations")
        .update(payload as never)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("payment_method_configurations")
        .insert(payload as never);
      if (error) throw new Error(error.message);
    }

    // Only the shared platform configuration drives the method-level flag.
    if (!data.owner_id) {
      await context.supabase
        .from("payment_methods")
        .update({
          is_configured: Boolean(payload["consumer_key"] && payload["consumer_secret"]),
        } as never)
        .eq("id", data.payment_method_id);
    }

    const { data: row } = await scopeOwner(
      context.supabase
        .from("payment_method_configurations")
        .select("*")
        .eq("payment_method_id", data.payment_method_id)
        .eq("environment", data.environment),
      data.owner_id,
    ).maybeSingle();

    return toView(
      data.payment_method_id,
      data.environment,
      row,
      appBaseUrl(),
      data.owner_id ?? null,
    );
  });

async function loadCredentials(
  context: any,
  payment_method_id: string,
  environment: "sandbox" | "production",
  owner_id?: string | null,
) {
  const { data: row, error } = await scopeOwner(
    context.supabase
      .from("payment_method_configurations")
      .select("*")
      .eq("payment_method_id", payment_method_id)
      .eq("environment", environment),
    owner_id,
  ).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Save the M-Pesa configuration for this environment first.");
  return row as any;
}

export const testMpesaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        payment_method_id: z.string().uuid(),
        environment: environmentSchema,
        owner_id: ownerSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const row = await loadCredentials(
      context,
      data.payment_method_id,
      data.environment,
      data.owner_id,
    );
    if (!row.consumer_key || !row.consumer_secret) {
      return { ok: false, message: "Enter and save the Consumer Key and Consumer Secret first." };
    }
    const { getDarajaToken } = await import("./mpesa.server");
    try {
      await getDarajaToken(data.environment, row.consumer_key, row.consumer_secret);
      return { ok: true, message: `M-Pesa API connection successful (${data.environment}).` };
    } catch (e) {
      return {
        ok: false,
        message:
          (e as Error).message ||
          "Unable to connect to M-Pesa API. Please verify your credentials and environment.",
      };
    }
  });

export const registerC2BUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        payment_method_id: z.string().uuid(),
        environment: environmentSchema,
        owner_id: ownerSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const row = await loadCredentials(
      context,
      data.payment_method_id,
      data.environment,
      data.owner_id,
    );
    if (!row.c2b_enabled) return { ok: false, message: "Enable C2B and save before registering URLs." };
    const shortCode = row.c2b_short_code || row.business_short_code;
    if (!shortCode) return { ok: false, message: "A C2B short code is required." };

    const { getDarajaToken, darajaPost } = await import("./mpesa.server");
    const urls = mpesaCallbackUrls(appBaseUrl());
    try {
      const token = await getDarajaToken(data.environment, row.consumer_key, row.consumer_secret);
      const res = await darajaPost(data.environment, "/mpesa/c2b/v1/registerurl", token, {
        ShortCode: shortCode,
        ResponseType: row.c2b_response_type || "Completed",
        ConfirmationURL: urls.c2b_confirmation_url,
        ValidationURL: urls.c2b_validation_url,
      });
      return {
        ok: res.ok,
        message: res.ok ? "C2B URLs registered with Safaricom." : "C2B registration failed.",
        response: res.body,
      };
    } catch (e) {
      return { ok: false, message: (e as Error).message, response: null };
    }
  });

export const initiateStkPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        payment_method_id: z.string().uuid(),
        environment: environmentSchema,
        owner_id: ownerSchema,
        phone: z.string().trim().min(9, "Enter a valid phone number").max(15),
        amount: z.coerce.number().positive("Amount must be greater than zero"),
        account_reference: z.string().trim().max(50).optional(),
        payment_id: z.string().uuid().optional(),
        user_id: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const row = await loadCredentials(
      context,
      data.payment_method_id,
      data.environment,
      data.owner_id,
    );
    if (!row.enabled || !row.stk_enabled) {
      return { ok: false, message: "Enable the M-Pesa integration and STK Push first." };
    }
    if (!row.business_short_code || !row.passkey) {
      return { ok: false, message: "Business Short Code and Passkey are required for STK Push." };
    }

    const { getDarajaToken, darajaPost, darajaTimestamp, stkPassword, normalizeMsisdn } =
      await import("./mpesa.server");
    const urls = mpesaCallbackUrls(appBaseUrl());
    const msisdn = normalizeMsisdn(data.phone);
    const timestamp = darajaTimestamp();
    const reference = data.account_reference || row.account_reference || "SmatraPay";

    let token: string;
    try {
      token = await getDarajaToken(data.environment, row.consumer_key, row.consumer_secret);
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }

    const res = await darajaPost(data.environment, "/mpesa/stkpush/v1/processrequest", token, {
      BusinessShortCode: row.business_short_code,
      Password: stkPassword(row.business_short_code, row.passkey, timestamp),
      Timestamp: timestamp,
      TransactionType: row.transaction_type || "CustomerPayBillOnline",
      Amount: Math.round(data.amount),
      PartyA: msisdn,
      PartyB: row.business_short_code,
      PhoneNumber: msisdn,
      CallBackURL: urls.stk_callback_url,
      AccountReference: reference.slice(0, 12),
      TransactionDesc: (row.transaction_desc || "Payment").slice(0, 100),
    });

    const body = res.body ?? {};
    const accepted = res.ok && String(body.ResponseCode ?? "") === "0";

    await context.supabase.from("mpesa_transactions").insert({
      payment_method_id: data.payment_method_id,
      payment_id: data.payment_id ?? null,
      user_id: data.user_id ?? data.owner_id ?? null,
      environment: data.environment,
      flow: "stk",
      merchant_request_id: body.MerchantRequestID ?? null,
      checkout_request_id: body.CheckoutRequestID ?? null,
      phone_number: msisdn,
      amount: data.amount,
      account_reference: reference,
      result_code: accepted ? null : String(body.ResponseCode ?? body.errorCode ?? ""),
      result_desc: accepted
        ? (body.CustomerMessage ?? "Request accepted for processing")
        : (body.errorMessage ?? body.ResponseDescription ?? "STK Push request failed"),
      status: accepted ? "pending" : "failed",
    } as never);

    return {
      ok: accepted,
      message: accepted
        ? "STK Push sent. Ask the customer to enter their M-Pesa PIN."
        : (body.errorMessage ?? body.ResponseDescription ?? "STK Push request failed."),
      checkout_request_id: body.CheckoutRequestID ?? null,
    };
  });

export const listMpesaTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        payment_method_id: z.string().uuid(),
        owner_id: ownerSchema,
        limit: z.number().max(100).default(25),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    let query = context.supabase
      .from("mpesa_transactions")
      .select(
        "id, environment, flow, checkout_request_id, phone_number, amount, account_reference, mpesa_receipt_number, result_code, result_desc, status, transaction_date, created_at",
      )
      .eq("payment_method_id", data.payment_method_id);
    if (data.owner_id) query = query.eq("user_id", data.owner_id);
    const { data: rows, error } = await query
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { transactions: (rows ?? []) as any[] };
  });
