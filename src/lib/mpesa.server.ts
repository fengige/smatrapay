/**
 * Server-only Safaricom Daraja API helpers.
 * Never import this from client code: it handles raw credentials.
 */

export type MpesaEnvironment = "sandbox" | "production";

export function darajaBaseUrl(environment: MpesaEnvironment) {
  return environment === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

/** OAuth client-credentials token. Never log or return the token to clients. */
export async function getDarajaToken(
  environment: MpesaEnvironment,
  consumerKey: string,
  consumerSecret: string,
): Promise<string> {
  const basic = btoa(`${consumerKey}:${consumerSecret}`);
  const res = await fetch(
    `${darajaBaseUrl(environment)}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${basic}` } },
  );
  if (!res.ok) {
    throw new Error(
      res.status === 400 || res.status === 401
        ? "Unable to connect to M-Pesa API. Please verify your credentials and environment."
        : `M-Pesa authentication failed (HTTP ${res.status}).`,
    );
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error("Unable to connect to M-Pesa API. Please verify your credentials and environment.");
  }
  return body.access_token;
}

/** Daraja timestamp: YYYYMMDDHHmmss in Africa/Nairobi time. */
export function darajaTimestamp(now = new Date()) {
  const nairobi = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return (
    `${nairobi.getUTCFullYear()}${p(nairobi.getUTCMonth() + 1)}${p(nairobi.getUTCDate())}` +
    `${p(nairobi.getUTCHours())}${p(nairobi.getUTCMinutes())}${p(nairobi.getUTCSeconds())}`
  );
}

export function stkPassword(shortCode: string, passkey: string, timestamp: string) {
  return btoa(`${shortCode}${passkey}${timestamp}`);
}

/** Normalise a Kenyan phone number to the 2547XXXXXXXX / 2541XXXXXXXX MSISDN form. */
export function normalizeMsisdn(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

/** Exact owner first, then the existing platform fallback. Never another owner. */
export async function mpesaConfigFor(db: any, ownerId: string | null) {
  const pick = async (owner: string | null) => {
    let q = db.from("payment_method_configurations").select("*").eq("enabled", true).eq("stk_enabled", true);
    q = owner ? q.eq("owner_id", owner) : q.is("owner_id", null);
    const { data } = await q;
    const rows = (data ?? []).filter((r: any) => r.business_short_code && r.passkey && r.consumer_key && r.consumer_secret);
    return rows.find((r: any) => r.environment === "production") ?? rows[0] ?? null;
  };
  return (ownerId ? await pick(ownerId) : null) ?? (await pick(null));
}

export async function darajaPost<T = any>(
  environment: MpesaEnvironment,
  path: string,
  token: string,
  payload: unknown,
): Promise<{ ok: boolean; status: number; body: T }> {
  const res = await fetch(`${darajaBaseUrl(environment)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = { raw: await res.text().catch(() => "") };
  }
  return { ok: res.ok, status: res.status, body };
}
