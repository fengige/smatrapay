import { createClient } from "@supabase/supabase-js";
import { publicMeterSchema, type CheckedMeter, type SafeToken } from "./meter-search";

export function createCheckerClient(url: string, key: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    } },
  });
}

async function lookup(db: ReturnType<typeof createCheckerClient>, input: unknown, requestKey: string, history: boolean) {
  const { meter_number } = publicMeterSchema.parse(input);
  const { data, error } = await db.rpc("public_token_checker", {
    p_meter_number: meter_number, p_request_key: requestKey, p_history: history,
  });
  if (error || !data) throw new Error("Could not load meter information. Please try again.");
  if (data.error) throw new Error(data.error);
  return data;
}

export async function checkPublicMeter(db: ReturnType<typeof createCheckerClient>, input: unknown, requestKey: string): Promise<{ meter: CheckedMeter | null; support: { email: string | null; phone: string | null } }> {
  const data = await lookup(db, input, requestKey, false);
  const email = String(data.support?.email ?? "").trim();
  const phone = String(data.support?.phone ?? "").trim();
  return { meter: data.meter ? { meter_number: data.meter.meter_number, type: data.meter.type } : null,
    support: { email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      phone: /^\+?[\d ()-]{7,25}$/.test(phone) ? phone : null } };
}

export async function readCheckedTokens(db: ReturnType<typeof createCheckerClient>, input: unknown, requestKey: string): Promise<SafeToken[]> {
  const data = await lookup(db, input, requestKey, true);
  if (!data.meter) throw new Error("This meter could not be verified. Contact the administrator.");
  // Re-project the public RPC response: never pass unlisted fields to the browser.
  return (data.tokens ?? []).slice(0, 3).map((r: SafeToken) => ({
    date: r.date, property: r.property, unit: r.unit, meter: data.meter.meter_number,
    token: r.token, units: Number(r.units ?? 0), amount: Number(r.amount ?? 0),
    reference: r.reference, status: r.status,
  }));
}
