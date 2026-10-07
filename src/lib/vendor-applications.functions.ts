import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertVendor, logVendorAction } from "@/lib/vendor.server";

/**
 * AI-assisted tenant application intake for the vendor portal.
 *
 * The chat only ever reads/writes `vendor_tenant_applications` rows owned by
 * the authenticated vendor (RLS-bound client), and it never creates residents
 * itself — the collected details are handed to the existing Add Resident
 * wizard for the vendor to review and submit.
 */

export type ApplicationMessage = { role: "user" | "assistant"; content: string; at: string };

export type ApplicationDetails = {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  phone: string;
  id_number: string;
  address: string;
};

export const emptyApplicationDetails: ApplicationDetails = {
  first_name: "",
  middle_name: "",
  last_name: "",
  email: "",
  phone: "",
  id_number: "",
  address: "",
};

export type VendorApplication = {
  id: string;
  status: string;
  messages: ApplicationMessage[];
  details: ApplicationDetails;
  resident_id: string | null;
  created_at: string;
  updated_at: string;
};

const uuid = z.string().uuid();

const GREETING =
  "Hi! I'll help you capture a new tenant application. To start, what is the applicant's full name?";

function normalise(row: any): VendorApplication {
  return {
    id: row.id,
    status: row.status,
    messages: Array.isArray(row.messages) ? (row.messages as ApplicationMessage[]) : [],
    details: { ...emptyApplicationDetails, ...(row.details ?? {}) },
    resident_id: row.resident_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const listVendorApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const vendorId = await assertVendor(context as any);
    const supabase = (context as any).supabase;
    const { data, error } = await supabase
      .from("vendor_tenant_applications")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("updated_at", { ascending: false })
      .limit(25);
    if (error) throw new Error(error.message);
    return { applications: ((data ?? []) as any[]).map(normalise) };
  });

export const getVendorApplication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const vendorId = await assertVendor(context as any);
    const supabase = (context as any).supabase;
    const { data: row, error } = await supabase
      .from("vendor_tenant_applications")
      .select("*")
      .eq("id", data.id)
      .eq("vendor_id", vendorId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Application not found");
    return { application: normalise(row) };
  });

export const startVendorApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const vendorId = await assertVendor(context as any);
    const supabase = (context as any).supabase;
    const messages: ApplicationMessage[] = [
      { role: "assistant", content: GREETING, at: new Date().toISOString() },
    ];
    const { data: row, error } = await supabase
      .from("vendor_tenant_applications")
      .insert({
        vendor_id: vendorId,
        status: "in_progress",
        messages,
        details: emptyApplicationDetails,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logVendorAction(supabase, vendorId, "VENDOR_TENANT_APPLICATION_STARTED", {
      type: "vendor_tenant_application",
      id: row.id,
    });
    return { application: normalise(row) };
  });

const detailSchema = z.object({
  first_name: z.string().nullable(),
  middle_name: z.string().nullable(),
  last_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  id_number: z.string().nullable(),
  address: z.string().nullable(),
});

const replySchema = z.object({
  reply: z.string(),
  details: detailSchema,
  ready: z.boolean(),
});

const SYSTEM_PROMPT = `You are the SmatraPay tenant application assistant used by property vendors.
Your job is to collect the details needed to register a new resident:
first name, middle name (optional), last name, email address, phone number,
national ID number and physical address.

Rules:
- Ask for at most two missing details per message, in a warm, short, professional tone.
- Re-use everything already collected; never ask again for a value you already have.
- Split a full name the applicant gives into first / middle / last.
- Politely ask again if an email or phone number looks invalid.
- Always return the complete set of details collected so far, using null for anything still unknown.
- Set "ready" to true only when first name, last name, email and phone are all collected.
- When ready, confirm the summary and tell the vendor they can review and submit it in the Add Resident form.`;

export const sendVendorApplicationMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, message: z.string().trim().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const vendorId = await assertVendor(context as any);
    const supabase = (context as any).supabase;

    const { data: row, error } = await supabase
      .from("vendor_tenant_applications")
      .select("*")
      .eq("id", data.id)
      .eq("vendor_id", vendorId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Application not found");

    const application = normalise(row);
    const history: ApplicationMessage[] = [
      ...application.messages,
      { role: "user", content: data.message, at: new Date().toISOString() },
    ];

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI assistant is not configured");

    let reply = "";
    let details = application.details;
    let ready = false;

    // Plain fetch to the AI gateway (the SDK pulls in Node-only code that crashes the live site).
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\nRespond ONLY with a JSON object of shape {"reply": string, "ready": boolean, "details": {"first_name","middle_name","last_name","email","phone","id_number","address"} (strings or null)}.`,
          },
          { role: "user", content: `Details collected so far (JSON): ${JSON.stringify(application.details)}` },
          ...history.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });
    if (res.status === 429) throw new Error("The assistant is busy right now. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits are exhausted. Add credits to continue using the assistant.");
    if (!res.ok) throw new Error("The assistant is unavailable right now.");
    try {
      const body: any = await res.json();
      const output = replySchema.parse(JSON.parse(body?.choices?.[0]?.message?.content ?? ""));
      reply = output.reply;
      ready = output.ready;
      details = {
        first_name: output.details.first_name ?? "",
        middle_name: output.details.middle_name ?? "",
        last_name: output.details.last_name ?? "",
        email: output.details.email ?? "",
        phone: output.details.phone ?? "",
        id_number: output.details.id_number ?? "",
        address: output.details.address ?? "",
      };
    } catch {
      throw new Error("The assistant could not read that reply. Please rephrase and try again.");
    }

    const messages: ApplicationMessage[] = [
      ...history,
      { role: "assistant", content: reply, at: new Date().toISOString() },
    ];

    const { data: updated, error: saveError } = await supabase
      .from("vendor_tenant_applications")
      .update({ messages, details, status: ready ? "ready" : "in_progress" })
      .eq("id", data.id)
      .eq("vendor_id", vendorId)
      .select("*")
      .single();
    if (saveError) throw new Error(saveError.message);

    return { application: normalise(updated), ready };
  });

export const linkVendorApplicationResident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, resident_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const vendorId = await assertVendor(context as any);
    const supabase = (context as any).supabase;
    const { error } = await supabase
      .from("vendor_tenant_applications")
      .update({ resident_id: data.resident_id, status: "converted" })
      .eq("id", data.id)
      .eq("vendor_id", vendorId);
    if (error) throw new Error(error.message);
    await logVendorAction(
      supabase,
      vendorId,
      "VENDOR_TENANT_APPLICATION_CONVERTED",
      { type: "vendor_tenant_application", id: data.id },
      { resident_id: data.resident_id },
    );
    return { ok: true };
  });

export const deleteVendorApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const vendorId = await assertVendor(context as any);
    const supabase = (context as any).supabase;
    const { error } = await supabase
      .from("vendor_tenant_applications")
      .delete()
      .eq("id", data.id)
      .eq("vendor_id", vendorId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
