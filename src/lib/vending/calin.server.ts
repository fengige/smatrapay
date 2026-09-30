import type {
  VendingCallLog,
  VendingCredentials,
  VendingIntegration,
  VendingOutcome,
  VendingRequest,
  VendingAction,
} from "./types";

/**
 * CALIN SYSTEM API integration.
 *
 * Request/response shapes follow the published CALIN Swagger contract:
 *   POST /api/POS_Purchase            -> POSPurchaseRequest / POSVendResponse
 *   POST /api/Maintenance_ClearTamper -> MaintenanceClearTamperRequest / …Response
 *   POST /api/Maintenance_ClearCredit -> MaintenanceClearCreditRequest / …Response
 *
 * Credentials (company name, user name, password) and endpoints always come
 * from the meter supplier's API settings — never from source code or the client.
 */

const TIMEOUT_MS = 30_000;

type CalinReceipt = {
  total_paid?: number;
  total_unit?: number;
  token?: string;
  customer_number?: string;
  customer_name?: string;
  meter_number?: string;
  gen_datetime?: string;
  gen_user?: string;
  company?: string;
  price?: number;
  vat?: number;
  tid_datetime?: string;
  currency?: string;
  unit?: string;
  TaskNo?: string;
};

type CalinResponse = {
  result_code?: number;
  result?: CalinReceipt | string | null;
  reason?: string | null;
};

function endpointFor(action: VendingAction, c: VendingCredentials): string | null {
  switch (action) {
    case "credit":
      return c.api_pos_purchase;
    case "clear_tamper":
      return c.api_maintenance_clear_tamper;
    case "clear_credit":
      return c.api_maintenance_clear_credit;
    case "set_max_overdraft":
      return c.api_maintenance_set_overdraft_limit;
    default:
      return null;
  }
}

/** Redacted copy of the outgoing payload — passwords are never persisted. */
function maskRequest(body: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = { ...body };
  for (const key of ["password", "password_vend"]) {
    if (key in masked) masked[key] = masked[key] ? "***" : "";
  }
  return masked;
}

function friendlyFailure(
  httpStatus: number | null,
  resultCode: number | null,
  reason: string | null,
): { error_code: string; message: string } {
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      error_code: `HTTP_${httpStatus}`,
      message:
        "Unable to authenticate with the meter vending service. Please verify the supplier API credentials.",
    };
  }
  if (httpStatus !== null && httpStatus >= 500) {
    return {
      error_code: `HTTP_${httpStatus}`,
      message: "The vending service is currently unavailable. Please try again later.",
    };
  }
  const text = (reason ?? "").toLowerCase();
  if (
    text.includes("password") ||
    text.includes("user") ||
    text.includes("login") ||
    text.includes("authoriz") ||
    text.includes("authentic")
  ) {
    return {
      error_code: `CALIN_${resultCode ?? "ERR"}`,
      message:
        "Unable to authenticate with the meter vending service. Please verify the supplier API credentials.",
    };
  }
  if (text.includes("meter")) {
    return {
      error_code: `CALIN_${resultCode ?? "ERR"}`,
      message:
        "The meter was rejected by the vending service. Please verify the meter number and configuration.",
    };
  }
  if (text.includes("amount") || text.includes("unit") || text.includes("price")) {
    return {
      error_code: `CALIN_${resultCode ?? "ERR"}`,
      message: "The token purchase amount was rejected by the vending service.",
    };
  }
  return {
    error_code: `CALIN_${resultCode ?? "ERR"}`,
    message: reason?.trim()
      ? `The vending service rejected the request: ${reason.trim()}`
      : "The vending service rejected the request. Please try again or contact support.",
  };
}

export const calinVendingService: VendingIntegration = {
  code: "CALIN",

  requiredSettings(action) {
    const base: (keyof VendingCredentials)[] = ["api_company_name", "api_user_name", "api_password"];
    switch (action) {
      case "credit":
        return ["api_pos_purchase", ...base];
      case "clear_tamper":
        return ["api_maintenance_clear_tamper", ...base];
      case "clear_credit":
        return ["api_maintenance_clear_credit", ...base];
      default:
        // No documented CALIN operation — handled by SmatraPay locally.
        return [];
    }
  },

  async execute(
    request: VendingRequest,
    credentials: VendingCredentials,
  ): Promise<{ outcome: VendingOutcome; log: VendingCallLog | null }> {
    if (request.action === "key_change" || request.action === "set_max_overdraft") {
      if (request.action === "key_change" || !credentials.api_maintenance_set_overdraft_limit) {
        return {
          outcome: {
            ok: "local",
            reason: "CALIN exposes no remote operation for this action",
          },
          log: null,
        };
      }
    }

    const endpoint = endpointFor(request.action, credentials);
    if (!endpoint) {
      return {
        outcome: {
          ok: false,
          error_code: "NO_ENDPOINT",
          message:
            "The Meter Supplier API settings have not been configured. Please configure the supplier API settings before generating a token.",
          state: "failed",
        },
        log: null,
      };
    }

    const auth = {
      company_name: credentials.api_company_name ?? "",
      user_name: credentials.api_user_name ?? "",
      password: credentials.api_password ?? "",
    };

    const body: Record<string, unknown> =
      request.action === "credit"
        ? {
            ...auth,
            password_vend: "",
            meter_number: request.meter_number,
            is_vend_by_unit: request.vend_by_unit,
            amount: request.vend_by_unit ? request.units : request.amount,
          }
        : request.action === "set_max_overdraft"
          ? { ...auth, meter_number: request.meter_number, amount: request.units }
          : { ...auth, meter_number: request.meter_number };

    const operation = endpoint.split("/").pop() || request.action;
    const requestAt = new Date();
    const started = Date.now();

    const log = (over: Partial<VendingCallLog>): VendingCallLog => ({
      operation,
      endpoint,
      request_at: requestAt.toISOString(),
      response_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      http_status: null,
      provider_result_code: null,
      provider_reference: null,
      success: false,
      error_code: null,
      error_message: null,
      request_payload: maskRequest(body),
      response_payload: null,
      ...over,
    });

    let res: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      const failure = aborted
        ? {
            error_code: "TIMEOUT",
            message:
              "The vending service did not respond within the expected time. The transaction has been placed under review.",
            state: "review" as const,
          }
        : {
            error_code: "NETWORK",
            message: "The vending service is currently unavailable. Please try again later.",
            state: "failed" as const,
          };
      return {
        outcome: { ok: false, ...failure },
        log: log({ error_code: failure.error_code, error_message: failure.message }),
      };
    }

    const raw = await res.text();
    let parsed: CalinResponse | null = null;
    try {
      parsed = raw ? (JSON.parse(raw) as CalinResponse) : null;
    } catch {
      parsed = null;
    }

    const resultCode = typeof parsed?.result_code === "number" ? parsed.result_code : null;
    const reason = typeof parsed?.reason === "string" ? parsed.reason : null;
    const receipt =
      parsed && typeof parsed.result === "object" && parsed.result !== null
        ? (parsed.result as CalinReceipt)
        : null;
    const token = (receipt?.token ?? "").trim();

    if (res.ok && resultCode === 0 && token) {
      const metadata: Record<string, unknown> = {
        provider: "CALIN",
        operation,
        result_code: resultCode,
        receipt: receipt ?? {},
      };
      return {
        outcome: {
          ok: true,
          token,
          units: typeof receipt?.total_unit === "number" ? receipt.total_unit : null,
          amount: typeof receipt?.total_paid === "number" ? receipt.total_paid : null,
          provider_reference: receipt?.TaskNo?.toString().trim() || null,
          metadata,
        },
        log: log({
          http_status: res.status,
          provider_result_code: String(resultCode),
          provider_reference: receipt?.TaskNo ?? null,
          success: true,
          response_payload: { result_code: resultCode, receipt: receipt ?? {} },
        }),
      };
    }

    // Maintenance operations return a plain string result.
    if (res.ok && resultCode === 0 && typeof parsed?.result === "string" && parsed.result.trim()) {
      const value = parsed.result.trim();
      return {
        outcome: {
          ok: true,
          token: value,
          units: null,
          amount: null,
          provider_reference: null,
          metadata: { provider: "CALIN", operation, result_code: resultCode, result: value },
        },
        log: log({
          http_status: res.status,
          provider_result_code: String(resultCode),
          success: true,
          response_payload: { result_code: resultCode, result: value },
        }),
      };
    }

    const failure = friendlyFailure(res.ok ? null : res.status, resultCode, reason);
    return {
      outcome: { ok: false, ...failure, state: "failed" },
      log: log({
        http_status: res.status,
        provider_result_code: resultCode === null ? null : String(resultCode),
        error_code: failure.error_code,
        error_message: reason ?? failure.message,
        response_payload: parsed
          ? { result_code: resultCode, reason }
          : { body: raw.slice(0, 500) },
      }),
    };
  },
};
