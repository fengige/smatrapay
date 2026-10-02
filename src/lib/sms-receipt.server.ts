/**
 * Shared SMS receipt sender for admin Token Management and POS.
 * Resolves the meter's real owner from the meter record, then uses that
 * owner's enabled SMS provider configuration. Never falls back to another
 * owner's credentials.
 */
export type OwnerType = "vendor" | "landlord" | "agent";

export type ReceiptSmsResult = {
  status: "sent" | "failed";
  /** "sent" means accepted by the provider, not confirmed delivered. */
  message: string;
  provider: string | null;
  provider_message_id: string | null;
  owner_type: OwnerType | null;
  owner_name: string | null;
};

export function resolveMeterOwner(m: { landlord_id?: string | null; agent_id?: string | null; vendor_id?: string | null }) {
  if (m.landlord_id) return { id: m.landlord_id, type: "landlord" as const };
  if (m.agent_id) return { id: m.agent_id, type: "agent" as const };
  if (m.vendor_id && /^[0-9a-f-]{36}$/i.test(m.vendor_id)) return { id: m.vendor_id, type: "vendor" as const };
  return null;
}

const label = (t: OwnerType) => t.charAt(0).toUpperCase() + t.slice(1);

function normalizePhone(raw: string, cc: string) {
  let p = raw.replace(/[\s\-()]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  else if (p.startsWith("00")) p = p.slice(2);
  else if (p.startsWith("0")) p = cc + p.slice(1);
  else if (!p.startsWith(cc) && p.length <= 9) p = cc + p;
  if (!/^\d{9,15}$/.test(p)) throw new Error("Invalid recipient phone number");
  return p;
}

export async function sendTokenReceiptSms(
  supabase: any,
  opts: { tokenId: string; phone: string; actorId: string | null },
): Promise<ReceiptSmsResult> {
  const { data: tok } = await supabase.from("meter_tokens").select("*").eq("id", opts.tokenId).maybeSingle();
  if (!tok) throw new Error("Token not found");
  const { data: meter } = await supabase
    .from("meters")
    .select("id, meter_number, landlord_id, agent_id, vendor_id")
    .eq("id", tok.meter_id)
    .maybeSingle();

  const owner = meter ? resolveMeterOwner(meter) : null;
  let ownerName: string | null = null;
  if (owner) {
    const { data: u } = await supabase.from("users").select("name, email").eq("id", owner.id).maybeSingle();
    ownerName = u?.name ?? u?.email ?? null;
  }

  const base = { owner_type: owner?.type ?? null, owner_name: ownerName };
  const fail = async (message: string, provider: string | null = null, configId: string | null = null, to: string | null = null) => {
    await supabase.from("token_sms_logs").insert({
      token_id: tok.id, phone: opts.phone || "—", status: "failed", error: message, actor_id: opts.actorId,
    });
    if (configId) {
      await supabase.from("sms_messages").insert({
        configuration_id: configId, vendor_id: owner?.id ?? null, recipient_phone: to ?? opts.phone,
        message: `[token receipt ${tok.id}]`, status: "failed", error_message: message, created_by: opts.actorId,
      });
    }
    return { status: "failed" as const, message, provider, provider_message_id: null, ...base };
  };

  if (!owner) return fail("This meter has no owner assigned, so no SMS configuration can be used.");
  const who = `${label(owner.type)}: ${ownerName ?? "Unnamed"}`;

  // Owner SMS settings live in vendor_sms_configurations, keyed by the owner's user id.
  const { data: rows } = await supabase
    .from("vendor_sms_configurations")
    .select("*")
    .eq("vendor_id", owner.id);
  const enabled = (rows ?? []).find((r: any) => r.is_enabled);
  if (!enabled) {
    return fail(
      (rows ?? []).length
        ? `The SMS provider for ${who} is disabled. Please check the owner's SMS Configuration.`
        : `No active SMS provider is configured for ${who}.`,
    );
  }
  const { data: provider } = await supabase
    .from("sms_configurations")
    .select("id, provider_name, provider_code, is_active")
    .eq("id", enabled.sms_configuration_id)
    .maybeSingle();
  if (!provider || !provider.is_active)
    return fail(`The default SMS provider for ${who} is inactive under Configurations → SMS Configuration.`);
  if (provider.provider_code !== "tiara")
    return fail(`Sending through ${provider.provider_name} isn't supported yet (configured for ${who}).`, provider.provider_name, provider.id);
  if (!enabled.api_key || !enabled.sender_id || !enabled.api_url)
    return fail(`The SMS configuration for ${who} is incomplete (API key, sender ID or endpoint missing).`, provider.provider_name, provider.id);

  let to: string;
  try {
    to = normalizePhone(opts.phone, enabled.default_country_code || "254");
  } catch (e) {
    return fail((e as Error).message, provider.provider_name, provider.id);
  }

  const when = new Date(tok.created_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
  const text =
    `SmatraPay token for meter ${meter.meter_number}: ${tok.token}. ` +
    `Units ${Number(tok.units ?? 0)}, KES ${Number(tok.amount ?? 0).toFixed(2)}.` +
    (tok.reference ? ` Ref ${tok.reference}.` : "") +
    ` ${when}`;
  const refId = `rcpt-${crypto.randomUUID()}`;

  let http = 0;
  let j: any = {};
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const body: Record<string, unknown> = { from: enabled.sender_id, to, message: text, refId };
    if (enabled.message_type === 2) body["messageType"] = "2";
    const res = await fetch(enabled.api_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${enabled.api_key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    http = res.status;
    j = await res.json().catch(() => ({}));
  } catch (e) {
    return fail(
      (e as Error).name === "AbortError" ? "The SMS provider timed out." : "Could not reach the SMS provider.",
      provider.provider_name, provider.id, to,
    );
  }

  const ok = String(j.status ?? "").toUpperCase() === "SUCCESS" && String(j.statusCode ?? "") === "0";
  if (!ok) {
    const reason = http === 401 || http === 403 ? "API key rejected" : String(j.desc ?? `HTTP ${http}`).slice(0, 200);
    return fail(`The SMS provider rejected the receipt (${reason}). The token transaction was completed successfully.`, provider.provider_name, provider.id, to);
  }

  await supabase.from("token_sms_logs").insert({ token_id: tok.id, phone: to, status: "sent", actor_id: opts.actorId });
  await supabase.from("sms_messages").insert({
    configuration_id: provider.id, vendor_id: owner.id, recipient_phone: to, message: `[token receipt ${tok.id}]`,
    sender_id: enabled.sender_id, ref_id: refId, message_type: enabled.message_type ?? 1, status: "submitted",
    provider_message_id: j.msgId ?? null, cost: j.cost != null ? String(j.cost) : null,
    sent_at: new Date().toISOString(), created_by: opts.actorId,
  });
  await supabase.from("meter_tokens").update({ customer_phone: opts.phone, sms_requested: true }).eq("id", tok.id);
  return {
    status: "sent",
    message: `Receipt submitted via ${provider.provider_name} (${who}). Delivery not yet confirmed.`,
    provider: provider.provider_name,
    provider_message_id: j.msgId ?? null,
    ...base,
  };
}
