import { resolveMeterOwner } from "@/lib/sms-receipt.server";

export type JobSmsResult = { status: "submitted" | "failed"; message: string };
type Job = {
  id: string;
  request_number: string;
  vendor_id: string;
  resident_id: string | null;
  meter_id: string | null;
};

/** Called only after the authorized status update wins its compare-and-set. */
export async function sendJobStatusSms(
  sb: any,
  job: Job,
  status: "in_progress" | "resolved" | "cancelled",
  actorId: string,
  eventId: string,
): Promise<JobSmsResult> {
  let logId: string | null = null;
  const failed = async (message: string): Promise<JobSmsResult> => {
    if (logId) {
      await sb.from("sms_messages").update({ status: "failed", error_message: message }).eq("id", logId);
    } else {
      await sb.from("service_request_events").insert({
        request_id: job.id, vendor_id: job.vendor_id, actor_id: actorId,
        event_type: "note_added", note: `Customer SMS failed: ${message}`,
      });
    }
    return { status: "failed", message };
  };

  try {
    if (!job.resident_id) return await failed("No customer is linked to this job.");
    const { data: customer, error: customerError } = await sb.from("users")
      .select("phone").eq("id", job.resident_id).maybeSingle();
    if (customerError || !customer?.phone) return await failed("The customer has no available phone number.");

    // A meter-backed job must use that meter's actual owner; never fall back
    // to a different owner's credentials when their configuration is missing.
    let ownerId: string | null = job.vendor_id;
    if (job.meter_id) {
      const { data: meter, error } = await sb.from("meters")
        .select("landlord_id, agent_id, vendor_id").eq("id", job.meter_id).maybeSingle();
      ownerId = !error && meter ? resolveMeterOwner(meter)?.id ?? null : null;
    }
    if (!ownerId) return await failed("No SMS owner is assigned to this job's meter.");
    const { data: config, error: configError } = await sb.from("vendor_sms_configurations")
      .select("sms_configuration_id, api_key, sender_id, api_url, message_type, default_country_code")
      .eq("vendor_id", ownerId).eq("is_enabled", true).maybeSingle();
    if (configError || !config) return await failed("The job owner's SMS configuration is unavailable or disabled.");
    const { data: provider } = await sb.from("sms_configurations")
      .select("id, provider_code, is_active").eq("id", config.sms_configuration_id).maybeSingle();
    if (!provider?.is_active || provider.provider_code !== "tiara")
      return await failed("The job owner needs an active supported SMS provider.");
    if (!config.api_key || !config.sender_id || !config.api_url)
      return await failed("The job owner's SMS settings are incomplete.");

    let phone = String(customer.phone).replace(/[\s\-()]/g, "");
    const cc = config.default_country_code || "254";
    if (phone.startsWith("+")) phone = phone.slice(1);
    else if (phone.startsWith("00")) phone = phone.slice(2);
    else if (phone.startsWith("0")) phone = cc + phone.slice(1);
    else if (!phone.startsWith(cc) && phone.length <= 9) phone = cc + phone;
    if (!/^\d{9,15}$/.test(phone)) return await failed("The customer's phone number is invalid.");

    const refId = `job-${eventId}`;
    const { data: log, error: logError } = await sb.from("sms_messages").insert({
      configuration_id: provider.id, vendor_id: ownerId, recipient_phone: phone,
      message: `[job status ${job.id}: ${status}]`, sender_id: config.sender_id,
      ref_id: refId, message_type: config.message_type ?? 1, status: "pending", created_by: actorId,
    }).select("id").single();
    if (logError || !log) return await failed("Could not record the customer SMS attempt; no SMS was sent.");
    logId = log.id;

    const label = { in_progress: "In Progress", resolved: "Completed", cancelled: "Cancelled" }[status];
    const body: Record<string, unknown> = {
      from: config.sender_id, to: phone, refId,
      message: `SmatraPay: Your service request ${job.request_number} is now ${label}.`,
    };
    if (config.message_type === 2) body.messageType = "2";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(config.api_url, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify(body), signal: controller.signal, redirect: "error",
    }).finally(() => clearTimeout(timer));
    // Never log or return raw responses: a provider may echo credentials.
    if (!response.ok) return await failed(`The SMS provider rejected the message (HTTP ${response.status}).`);
    const result = await response.json() as { status?: unknown; statusCode?: unknown; msgId?: unknown };
    if (String(result.status).toUpperCase() !== "SUCCESS" || String(result.statusCode) !== "0")
      return await failed("The SMS provider did not accept the customer message.");
    const { error: logUpdateError } = await sb.from("sms_messages").update({
      status: "submitted", sent_at: new Date().toISOString(),
      provider_message_id: typeof result.msgId === "string" ? result.msgId : null,
    }).eq("id", logId);
    return { status: "submitted", message: logUpdateError
      ? "Customer SMS submitted; its history could not be updated. Delivery is not confirmed."
      : "Customer SMS submitted. Delivery is not confirmed." };
  } catch {
    // The job has already changed: SMS failure must never roll it back or
    // invite repeating a status transition (and potentially sending twice).
    try { return await failed("Customer SMS could not be confirmed. Check SMS history before sending again."); }
    catch { return { status: "failed", message: "Customer SMS could not be confirmed." }; }
  }
}