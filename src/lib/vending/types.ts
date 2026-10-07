/**
 * Vending software integration layer.
 *
 * Token generation is always driven by the vending software assigned to the
 * meter. Each supported platform implements `VendingIntegration`; new
 * platforms are added to the registry without touching the token workflow.
 */

export type VendingAction =
  | "credit"
  | "key_change"
  | "set_max_overdraft"
  | "clear_tamper"
  | "clear_credit";

/** Endpoints + credentials resolved from the meter supplier's API settings. */
export type VendingCredentials = {
  api_pos_purchase: string | null;
  api_login: string | null;
  api_maintenance_clear_tamper: string | null;
  api_maintenance_clear_credit: string | null;
  api_maintenance_set_overdraft_limit: string | null;
  api_company_name: string | null;
  api_user_name: string | null;
  api_password: string | null;
  /** CALIN POS operator vending password; falls back to api_password. */
  api_vend_password?: string | null;
  /** Icon-Token TaaS credentials. */
  api_taas_id?: string | null;
  api_taas_password?: string | null;
};

export type VendingRequest = {
  action: VendingAction;
  meter_number: string;
  /** Amount in the supplier's currency (credit purchases). */
  amount: number;
  /** Units requested when the sale is by units rather than by value. */
  units: number;
  vend_by_unit: boolean;
  /** Meter unit price from SmatraPay Price Management (server-read). */
  price_per_unit?: number | null;
};

export type VendingSuccess = {
  ok: true;
  token: string;
  /** Provider-reported values, when returned. */
  units: number | null;
  amount: number | null;
  provider_reference: string | null;
  /** Masked, reconciliation-safe copy of the provider response. */
  metadata: Record<string, unknown>;
};

export type VendingFailure = {
  ok: false;
  /** Internal code kept for troubleshooting, never shown raw to users. */
  error_code: string;
  /** User-facing message. */
  message: string;
  /** How the transaction should be recorded. */
  state: "failed" | "review";
};

/** The platform has no remote operation for this action — generate locally. */
export type VendingNotApplicable = { ok: "local"; reason: string };

export type VendingOutcome = VendingSuccess | VendingFailure | VendingNotApplicable;

/** Diagnostic record written to vending_integration_logs. */
export type VendingCallLog = {
  operation: string;
  endpoint: string | null;
  request_at: string;
  response_at: string | null;
  duration_ms: number | null;
  http_status: number | null;
  provider_result_code: string | null;
  provider_reference: string | null;
  success: boolean;
  error_code: string | null;
  error_message: string | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
};

export interface VendingIntegration {
  /** Matches vending_software.code, upper-cased. */
  readonly code: string;
  /** Endpoints/credentials this action needs; empty when handled locally. */
  requiredSettings(action: VendingAction): (keyof VendingCredentials)[];
  execute(
    request: VendingRequest,
    credentials: VendingCredentials,
  ): Promise<{ outcome: VendingOutcome; log: VendingCallLog | null }>;
}
