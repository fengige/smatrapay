import { getVendingIntegration } from "./registry.server";
import type { VendingAction, VendingCallLog, VendingCredentials } from "./types";

/**
 * Vending-software-driven token generation.
 *
 * Order of operations (never shortcut):
 *   validate meter -> resolve the vending software assigned to the meter
 *   -> resolve the supplier override or vending software API settings -> call the platform
 *   -> only then persist a token transaction.
 *
 * The vending software is always read from the meter record; callers cannot
 * supply or override it, and provider credentials never leave the server.
 */

export const NO_SOFTWARE_MESSAGE =
  "This meter does not have vending software assigned. Please assign vending software before generating a token.";
export const NO_SETTINGS_MESSAGE =
  "The API settings for this meter's vending software have not been configured. Please configure them under Vending Software → API Settings before generating a token.";

export type VendTokenParams = {
  meterId: string;
  action: VendingAction;
  units: number;
  amount: number;
  /** True when the customer buys a number of units rather than a value. */
  vendByUnit?: boolean;
  reference?: string | null;
  customerPhone?: string | null;
  smsRequested?: boolean;
  expiresInDays: number;
  actorId: string | null;
  /** One-time key from the caller; replays return the existing token. */
  requestId?: string | null;
  /** Extra columns merged into the meter_tokens insert. */
  extra?: Record<string, unknown>;
};

export type VendTokenResult = {
  row: any;
  reused: boolean;
  provider: string | null;
  providerReference: string | null;
  vendingSoftwareName: string | null;
};

/** Locally generated 20-digit STS-style token, in groups of four. */
function localToken() {
  let out = "";
  for (let i = 0; i < 20; i += 1) out += Math.floor(Math.random() * 10);
  return out.replace(/(\d{4})(?=\d)/g, "$1-");
}

async function writeLog(
  admin: any,
  base: {
    token_id: string | null;
    meter_id: string;
    meter_number: string;
    vending_software_id: string | null;
    software_code: string | null;
    supplier_id: string | null;
    actor_id: string | null;
  },
  log: VendingCallLog,
) {
  try {
    await admin.from("vending_integration_logs").insert({ ...base, ...log });
  } catch {
    // Diagnostics must never break a vend.
  }
}

export async function vendMeterToken(
  supabase: any,
  p: VendTokenParams,
): Promise<VendTokenResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Validate the meter (through the caller's RLS-scoped client).
  const { data: meter, error: meterErr } = await supabase
    .from("meters")
    .select("id, meter_number, status, supplier_id, vending_software_id, price_per_unit, commission_percentage, vat_on_commission_percentage")
    .eq("id", p.meterId)
    .maybeSingle();
  if (meterErr) throw new Error(meterErr.message);
  if (!meter) throw new Error("Meter not found");
  if (meter.status !== "active")
    throw new Error("This meter is not active — activate it before issuing tokens");

  // 2. Idempotency — a replayed request returns the existing token.
  const idempotencyKey = p.requestId
    ? `${p.meterId}:${p.action}:${p.requestId}`
    : null;
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from("meter_tokens")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing)
      return {
        row: existing,
        reused: true,
        provider: existing.provider ?? null,
        providerReference: existing.provider_reference ?? null,
        vendingSoftwareName: null,
      };
  }

  // 3. The vending software comes from the meter record only.
  if (!meter.vending_software_id) throw new Error(NO_SOFTWARE_MESSAGE);
  const { data: software } = await supabaseAdmin
    .from("vending_software")
    .select("vending_software_id, name, code, status")
    .eq("vending_software_id", meter.vending_software_id)
    .maybeSingle();
  if (!software) throw new Error(NO_SOFTWARE_MESSAGE);

  // 3b. Commission + VAT on commission are deducted from the payment before
  // the token is generated. Rates: the meter's own values, else the defaults.
  let breakdown: import("@/lib/commission").CommissionBreakdown | null = null;
  let tokenAmount = p.amount;
  let tokenUnits = p.units;
  if (p.action === "credit") {
    const { deductCommission, grossUpForUnits } = await import("@/lib/commission");
    const { data: defaults } = await supabaseAdmin
      .from("pricing_settings")
      .select("commission_percentage, vat_on_commission_percentage")
      .maybeSingle();
    const m = meter as any;
    const cPct = Number(m.commission_percentage ?? (defaults as any)?.commission_percentage ?? 0);
    const vPct = Number(m.vat_on_commission_percentage ?? (defaults as any)?.vat_on_commission_percentage ?? 0);
    const price = Number(m.price_per_unit ?? 0);
    if (p.vendByUnit) {
      breakdown = grossUpForUnits(Math.round(p.units * price * 100) / 100, cPct, vPct);
    } else {
      breakdown = deductCommission(p.amount, cPct, vPct);
      if (breakdown.net_amount <= 0)
        throw new Error("The amount is too small to cover the commission and VAT. Enter a larger amount.");
      tokenAmount = breakdown.net_amount;
      tokenUnits = price > 0 ? Math.round((tokenAmount / price) * 10000) / 10000 : p.units;
    }
  }

  const integration = getVendingIntegration((software as any).code ?? (software as any).name);

  let token = localToken();
  let units = tokenUnits;
  let netAmount = tokenAmount;
  let provider: string | null = null;
  let providerReference: string | null = null;
  let metadata: Record<string, unknown> | null = null;
  let providerState = "successful";

  if (integration) {
    // 4. Use the API settings configured on the meter's vending software.
    const { data: resolved, error: settingsErr } = await supabaseAdmin
      .from("vending_software_api_settings")
      .select(
        "api_pos_purchase, api_login, api_maintenance_clear_tamper, api_maintenance_clear_credit, api_maintenance_set_overdraft_limit, api_company_name, api_user_name, api_password, api_vend_password, api_taas_id, api_taas_password",
      )
      .eq("vending_software_id", meter.vending_software_id)
      .maybeSingle();
    if (settingsErr) throw new Error("Could not load the vending software API settings.");
    if (!resolved) throw new Error(NO_SETTINGS_MESSAGE);

    const credentials: VendingCredentials = {
      api_pos_purchase: resolved.api_pos_purchase,
      api_login: resolved.api_login,
      api_maintenance_clear_tamper: resolved.api_maintenance_clear_tamper,
      api_maintenance_clear_credit: resolved.api_maintenance_clear_credit,
      api_maintenance_set_overdraft_limit: resolved.api_maintenance_set_overdraft_limit,
      api_company_name: resolved.api_company_name,
      api_user_name: resolved.api_user_name,
      api_password: resolved.api_password,
      api_vend_password: (resolved as any).api_vend_password ?? null,
      api_taas_id: (resolved as any).api_taas_id ?? null,
      api_taas_password: (resolved as any).api_taas_password ?? null,
    };

    const missing = integration
      .requiredSettings(p.action)
      .filter((key) => !String(credentials[key] ?? "").trim());
    if (missing.length) throw new Error(NO_SETTINGS_MESSAGE);

    const logBase = {
      token_id: null,
      meter_id: meter.id as string,
      meter_number: meter.meter_number as string,
      vending_software_id: meter.vending_software_id as string,
      software_code: integration.code,
      supplier_id: meter.supplier_id as string,
      actor_id: p.actorId,
    };

    const { outcome, log } = await integration.execute(
      {
        action: p.action,
        meter_number: meter.meter_number,
        amount: tokenAmount,
        units: tokenUnits,
        vend_by_unit: !!p.vendByUnit,
        price_per_unit: Number((meter as any).price_per_unit ?? 0),
      },
      credentials,
    );
    if (log) await writeLog(supabaseAdmin, logBase, log);

    if (outcome.ok === false) {
      // A rejected or unconfirmed call never becomes a successful token.
      throw Object.assign(new Error(outcome.message), { vendState: outcome.state, vendCode: outcome.error_code });
    }
    if (outcome.ok === true) {
      token = outcome.token;
      if (outcome.units !== null) units = outcome.units;
      if (outcome.amount !== null) netAmount = outcome.amount;
      provider = integration.code;
      providerReference = outcome.provider_reference;
      metadata = outcome.metadata;
    } else {
      // Handled locally by SmatraPay — no remote operation exists.
      metadata = { local: true, reason: outcome.reason, software: integration.code };
    }
  }

  // 5. Persist the token transaction.
  const insert: Record<string, unknown> = {
    meter_id: p.meterId,
    action: p.action,
    token,
    units,
    // amount = what the customer paid; net_amount = the value put on the token.
    amount: breakdown ? breakdown.gross_amount : netAmount,
    net_amount: breakdown ? netAmount : null,
    commission_percentage: breakdown?.commission_percentage ?? null,
    commission_amount: breakdown?.commission_amount ?? null,
    vat_on_commission_percentage: breakdown?.vat_on_commission_percentage ?? null,
    vat_on_commission_amount: breakdown?.vat_on_commission_amount ?? null,
    reference: p.reference?.trim() || null,
    customer_phone: p.customerPhone?.trim() || null,
    sms_requested: !!p.smsRequested,
    expires_at: new Date(Date.now() + p.expiresInDays * 86_400_000).toISOString(),
    issued_by: p.actorId,
    vending_software_id: meter.vending_software_id,
    supplier_id: meter.supplier_id ?? null,
    provider,
    provider_reference: providerReference,
    provider_state: providerState,
    provider_metadata: metadata,
    idempotency_key: idempotencyKey,
    ...(p.extra ?? {}),
  };

  const { data: row, error } = await supabase
    .from("meter_tokens")
    .insert(insert)
    .select("*")
    .single();
  if (error) {
    // A unique-key collision means a concurrent duplicate already vended.
    if (idempotencyKey && /duplicate key|unique/i.test(error.message)) {
      const { data: existing } = await supabase
        .from("meter_tokens")
        .select("*")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing)
        return {
          row: existing,
          reused: true,
          provider: existing.provider ?? null,
          providerReference: existing.provider_reference ?? null,
          vendingSoftwareName: (software as any).name ?? null,
        };
    }
    throw new Error(error.message);
  }

  if (provider) {
    await writeLog(
      supabaseAdmin,
      {
        token_id: (row as any).id,
        meter_id: meter.id as string,
        meter_number: meter.meter_number as string,
        vending_software_id: meter.vending_software_id as string,
        software_code: provider,
        supplier_id: meter.supplier_id ?? null,
        actor_id: p.actorId,
      },
      {
        operation: `token_recorded:${p.action}`,
        endpoint: null,
        request_at: new Date().toISOString(),
        response_at: new Date().toISOString(),
        duration_ms: null,
        http_status: null,
        provider_result_code: null,
        provider_reference: providerReference,
        success: true,
        error_code: null,
        error_message: null,
        request_payload: null,
        response_payload: null,
      },
    );
  }

  providerState = "successful";
  return {
    row,
    reused: false,
    provider,
    providerReference,
    vendingSoftwareName: (software as any).name ?? null,
  };
}
