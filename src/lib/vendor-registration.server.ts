import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { VendorRegistration } from "./vendor-registration";
import { phoneHash } from "./resident-phone";
import { sendTemplateEmail } from "./email-templates/send-email";
import { trustedRecoveryUrl } from "./resident-password";

type DB = SupabaseClient<Database>;
type Application = Database["public"]["Tables"]["vendor_applications"]["Row"];
export async function requireRegistrationAdmin(db: DB, userId: string) {
  const { data, error } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Administrator access required");
}
export async function submitRegistration(db: DB, input: VendorRegistration, ip: string) {
  for (const key of ["ip:" + ip, "email:" + input.email]) {
    const { data, error } = await db.rpc("consume_vendor_application_limit", {
      p_key: await phoneHash(key),
    });
    if (error || !data) throw new Error("Too many submissions. Please try again in an hour.");
  }
  const { data: existing, error: readError } = await db
    .from("vendor_applications")
    .select("reference,status,email,phone")
    .eq("submission_key", input.submission_key)
    .maybeSingle();
  if (readError) throw new Error("Registration is temporarily unavailable");
  if (existing) {
    if (existing.email !== input.email || existing.phone !== input.phone)
      throw new Error("Please start a new application");
    return { reference: existing.reference, status: existing.status };
  }
  const { data, error } = await db
    .from("vendor_applications")
    .insert(input)
    .select("reference,status")
    .single();
  if (error || !data)
    throw new Error(
      error?.code === "23505"
        ? "An application already exists for these contact details. Please contact the administrator."
        : "Could not submit the application. Please try again.",
    );
  // No user, role, email or SMS is created at intake.
  return data;
}
export async function provisionApplication(db: DB, a: Application, actor: string) {
  if (!a.vendor_user_id) throw new Error("Account identity was not reserved");
  const { data: found, error: foundError } = await db.auth.admin.getUserById(a.vendor_user_id);
  if (foundError && foundError.status !== 404)
    throw new Error("Could not check the reserved account. Retry acceptance.");
  if (
    found.user &&
    (found.user.app_metadata["vendor_application_id"] !== a.id ||
      found.user.email?.toLowerCase() !== a.email)
  )
    throw new Error("Reserved account mismatch; administrator assistance required");
  if (!found.user) {
    const { error } = await db.auth.admin.createUser({
      id: a.vendor_user_id,
      email: a.email,
      password: `${crypto.randomUUID()}${crypto.randomUUID()}Aa1!`,
      ban_duration: "876000h",
      email_confirm: true,
      user_metadata: { name: a.business_name },
      app_metadata: { vendor_application_id: a.id },
    });
    if (error)
      throw new Error(
        "Could not create the vendor account. Resolve any existing email conflict, then retry acceptance.",
      );
  }
  const { error } = await db.rpc("complete_vendor_application", { p_id: a.id, p_actor: actor });
  if (error)
    throw new Error(
      "The account is reserved but approval is incomplete. Retry acceptance; no second account will be created.",
    );
}

async function applicationSms(db: DB, a: Application, actor: string, attempt: number) {
  const { data: config, error } = await db
    .from("sms_configurations")
    .select("id,provider_code,api_url,api_key,sender_id")
    .eq("is_active", true)
    .eq("is_default", true)
    .maybeSingle();
  if (
    error ||
    !config ||
    config.provider_code !== "tiara" ||
    !config.api_url ||
    !config.api_key ||
    !config.sender_id
  )
    throw new Error("Active default SMS configuration is unavailable");
  const message =
    a.status === "Accepted"
      ? `SmatraPay: ${a.business_name} application ${a.reference} accepted. Sign in at https://apps.smatrapay.com/login using ${a.email}. Use the secure password setup link sent by email; if it expires, select Forgot password. No password is sent by SMS.`
      : `SmatraPay: ${a.business_name} application ${a.reference} was not accepted. Reason: ${a.rejection_reason}.`;
  const ref = `vendor-${a.id}-${a.status}-${attempt}`;
  const { data: log, error: logError } = await db
    .from("sms_messages")
    .insert({
      configuration_id: config.id,
      recipient_phone: a.phone,
      message,
      sender_id: config.sender_id,
      ref_id: ref,
      status: "pending",
      created_by: actor,
    })
    .select("id")
    .single();
  if (logError || !log) throw new Error("Could not record SMS attempt");
  try {
    const response = await fetch(config.api_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify({ from: config.sender_id, to: a.phone.slice(1), message, refId: ref }),
      signal: AbortSignal.timeout(15000),
      redirect: "manual",
    });
    if (!response.ok) throw new Error("SMS provider refused the message");
    const result = (await response.json()) as {
      status?: string;
      statusCode?: number | string;
      msgId?: string;
    };
    if (String(result.status).toUpperCase() !== "SUCCESS" || String(result.statusCode) !== "0")
      throw new Error("SMS provider refused the message");
    const { error: updateError } = await db
      .from("sms_messages")
      .update({
        status: "submitted",
        sent_at: new Date().toISOString(),
        provider_message_id: result.msgId ?? null,
      })
      .eq("id", log.id);
    if (updateError) throw new Error("SMS outcome could not be recorded");
  } catch (e) {
    const refused = e instanceof Error && e.message === "SMS provider refused the message";
    await db
      .from("sms_messages")
      .update({
        status: "failed",
        error_message: refused
          ? "SMS provider refused the message"
          : "SMS submission could not be confirmed; inspect provider history before retry",
      })
      .eq("id", log.id);
    if (refused) throw new Error("SMS provider refused the message");
    // Network timeouts may mean delivered: do not automatically resend uncertain SMS.
    throw new Error("SMS submission uncertain");
  }
}
export async function notifyApplication(db: DB, id: string, actor: string) {
  const { data: a, error } = await db.from("vendor_applications").select("*").eq("id", id).single();
  if (error || !a || a.status === "Pending")
    throw new Error("Review the application before sending notifications");
  if (a.status === "Accepted" && a.vendor_user_id) {
    const { data: account, error: accountError } = await db.auth.admin.getUserById(
      a.vendor_user_id,
    );
    if (accountError || account.user?.app_metadata["vendor_application_id"] !== a.id)
      throw new Error("Application account could not be verified");
    const { error: activationError } = await db.auth.admin.updateUserById(a.vendor_user_id, {
      ban_duration: "none",
    });
    if (activationError)
      throw new Error("Approval saved; account activation needs retry before notifications");
  }
  for (const channel of ["email", "sms"] as const) {
    const state = a[`${channel}_status`];
    if (state !== "not_sent" && state !== "failed") continue;
    const attempt = a[`${channel}_attempt`] + 1;
    const patch =
      channel === "email"
        ? {
            email_status: "sending",
            email_attempt: attempt,
            email_attempted_at: new Date().toISOString(),
          }
        : {
            sms_status: "sending",
            sms_attempt: attempt,
            sms_attempted_at: new Date().toISOString(),
          };
    const { data: claimed, error: claimError } = await db
      .from("vendor_applications")
      .update(patch)
      .eq("id", id)
      .eq(`${channel}_status`, state)
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) continue;
    let outcome: "sent" | "failed" | "suppressed" | "uncertain" = "failed";
    let detail = "Notification failed; check sender configuration and retry.";
    try {
      if (channel === "sms") {
        await applicationSms(db, a, actor, attempt);
        outcome = "sent";
      } else {
        let setupUrl = "";
        if (a.status === "Accepted") {
          const { data: link, error: linkError } = await db.auth.admin.generateLink({
            type: "recovery",
            email: a.email,
            options: { redirectTo: trustedRecoveryUrl("https://apps.smatrapay.com") },
          });
          if (linkError || !link.properties?.action_link)
            throw new Error("Password setup unavailable");
          setupUrl = link.properties.action_link;
        }
        const result = await sendTemplateEmail(
          a.status === "Accepted" ? "vendor-accepted" : "vendor-rejected",
          a.email,
          {
            templateData: {
              business: a.business_name,
              reference: a.reference,
              reason: a.rejection_reason,
              setupUrl,
            },
            idempotencyKey: `vendor-${a.id}-${a.status}-email-${attempt}`,
          },
        );
        outcome = result.sent ? "sent" : "suppressed";
      }
      detail =
        outcome === "sent"
          ? "Submitted to provider; delivery is not confirmed."
          : "Recipient is suppressed; no retry allowed.";
    } catch (e) {
      if (channel === "sms" && e instanceof Error && e.message === "SMS submission uncertain") {
        outcome = "uncertain";
        detail = "SMS outcome uncertain; check SMS provider history before any manual resend.";
      }
    }
    const { error: saved } = await db
      .from("vendor_applications")
      .update(channel === "email" ? { email_status: outcome } : { sms_status: outcome })
      .eq("id", id)
      .eq(`${channel}_attempt`, attempt);
    if (saved)
      throw new Error(
        "Review saved, but notification outcome could not be recorded. Do not repeat acceptance.",
      );
    const { error: auditError } = await db
      .from("vendor_application_events")
      .insert({
        application_id: id,
        actor_id: actor,
        event_type: `${channel}: ${outcome}`,
        detail,
      });
    if (auditError)
      throw new Error(
        "Notification outcome saved, but its audit entry needs administrator attention",
      );
  }
  return { ok: true };
}
