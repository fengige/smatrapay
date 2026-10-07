import type {
  VendingCallLog,
  VendingCredentials,
  VendingIntegration,
  VendingOutcome,
  VendingRequest,
} from "./types";

/**
 * Icon-Token (ITaaS) integration.
 *
 *   POST {api_pos_purchase}  (e.g. https://api.icon-token.com:8443/itaas/icontoken/creditToken)
 *   { drn, units, unitsAmount, taasid, taaspasswd }  — all strings
 *   -> { ResultCode: "0", ResultDesc: "Accepted", TOKEN: "…" } on success
 *   -> { ResultCode: "IT00010", ResultDesc: "AUTH FAILED" } / "IT00016" Rejected …
 *
 * Endpoint + TaaS credentials come only from the vending software API settings.
 */

const TIMEOUT_MS = 30_000;
export const ICON_TIMEOUT_MESSAGE =
  "Unable to contact Icon-Token. Please verify the transaction status before retrying.";

/** Icon expects plain decimal strings without trailing zeros. */
export function iconNumber(n: number, dp: number): string {
  return String(Number(n.toFixed(dp)));
}

/** units = tokenizable amount / meter unit price (SmatraPay Price Management). */
export function iconUnits(amount: number, pricePerUnit: number): number {
  if (!(pricePerUnit > 0)) return 0;
  return Number((amount / pricePerUnit).toFixed(4));
}

export function iconFailure(code: string | null, desc: string | null, http: number | null) {
  const d = (desc ?? "").toUpperCase();
  if (code === "IT00010" || d.includes("AUTH"))
    return {
      error_code: `ICON_${code ?? "AUTH"}`,
      message:
        "Unable to authenticate with Icon-Token. Please check the TaaS ID and TaaS Password on the vending software API Settings tab.",
    };
  if (http !== null && http >= 500)
    return { error_code: `HTTP_${http}`, message: "The Icon-Token service is currently unavailable. Please try again later." };
  if (code === "IT00016" || d.includes("REJECT"))
    return {
      error_code: `ICON_${code ?? "REJECTED"}`,
      message: "Icon-Token rejected the request. Please verify the meter number is registered with Icon-Token and the amount is valid.",
    };
  return {
    error_code: `ICON_${code ?? "ERR"}`,
    message: desc?.trim() ? `Icon-Token rejected the request: ${desc.trim()}` : "Icon-Token returned an unexpected response.",
  };
}

export const iconVendingService: VendingIntegration = {
  code: "ICON",
  requiredSettings(action) {
    return action === "credit" ? ["api_pos_purchase", "api_taas_id", "api_taas_password"] : [];
  },
  async execute(req: VendingRequest, c: VendingCredentials) {
    if (req.action !== "credit") {
      return { outcome: { ok: "local", reason: "Icon-Token has no remote operation for this action" } as VendingOutcome, log: null };
    }
    const price = Number(req.price_per_unit ?? 0);
    if (!(price > 0))
      return {
        outcome: { ok: false, error_code: "NO_PRICE", message: "This meter has no unit price set in Price Management, so units cannot be calculated.", state: "failed" } as VendingOutcome,
        log: null,
      };
    const amount = req.vend_by_unit ? Number((req.units * price).toFixed(2)) : req.amount;
    const units = req.vend_by_unit ? req.units : iconUnits(amount, price);
    if (!(amount > 0) || !(units > 0))
      return {
        outcome: { ok: false, error_code: "INVALID_AMOUNT", message: "The amount is too small to buy any units at this meter's price.", state: "failed" } as VendingOutcome,
        log: null,
      };

    const body = {
      drn: req.meter_number,
      units: iconNumber(units, 4),
      unitsAmount: iconNumber(amount, 2),
      taasid: c.api_taas_id ?? "",
      taaspasswd: c.api_taas_password ?? "",
    };
    const endpoint = c.api_pos_purchase!;
    const started = Date.now();
    const log: VendingCallLog = {
      operation: "icon_credit_token",
      endpoint,
      request_at: new Date(started).toISOString(),
      response_at: null,
      duration_ms: null,
      http_status: null,
      provider_result_code: null,
      provider_reference: null,
      success: false,
      error_code: null,
      error_message: null,
      request_payload: { ...body, taasid: body.taasid ? "***" : "", taaspasswd: "***", unit_price: price },
      response_payload: null,
    };

    let http: number | null = null;
    let parsed: any = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      http = res.status;
      const raw = await res.text();
      try { parsed = JSON.parse(raw); } catch { parsed = null; }
      log.response_payload = parsed
        ? { ResultCode: parsed.ResultCode ?? null, ResultDesc: parsed.ResultDesc ?? null, has_token: Boolean(parsed.TOKEN) }
        : { body: raw.slice(0, 500) };
    } catch (e) {
      log.response_at = new Date().toISOString();
      log.duration_ms = Date.now() - started;
      log.error_code = (e as Error).name === "AbortError" ? "TIMEOUT" : "NETWORK";
      log.error_message = ICON_TIMEOUT_MESSAGE;
      return { outcome: { ok: false, error_code: log.error_code, message: ICON_TIMEOUT_MESSAGE, state: "review" } as VendingOutcome, log };
    }
    log.response_at = new Date().toISOString();
    log.duration_ms = Date.now() - started;
    log.http_status = http;
    const code = parsed?.ResultCode != null ? String(parsed.ResultCode) : null;
    const desc = parsed?.ResultDesc != null ? String(parsed.ResultDesc) : null;
    const token = typeof parsed?.TOKEN === "string" ? parsed.TOKEN.trim() : "";
    log.provider_result_code = code;

    if (http === 200 && code === "0" && /^[\d\s-]{16,}$/.test(token)) {
      const ref = `ICON-${req.meter_number}-${started}`;
      log.success = true;
      log.provider_reference = ref;
      return {
        outcome: {
          ok: true,
          token: token.replace(/\s+/g, "-"),
          units,
          amount,
          provider_reference: ref,
          metadata: { software: "ICON", result_code: code, result_desc: desc, unit_price: price, units_sent: body.units, amount_sent: body.unitsAmount },
        } as VendingOutcome,
        log,
      };
    }
    const f = iconFailure(code, desc, http);
    log.error_code = f.error_code;
    log.error_message = f.message;
    return { outcome: { ok: false, ...f, state: "failed" } as VendingOutcome, log };
  },
};
