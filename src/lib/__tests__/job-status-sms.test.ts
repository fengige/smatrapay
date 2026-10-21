import { afterEach, describe, expect, it, vi } from "vitest";
import { sendJobStatusSms } from "../job-status-sms.server";

const job = { id: "job-1", request_number: "SR-001", vendor_id: "vendor", resident_id: "resident", meter_id: "meter" };
function database(options: { disabled?: boolean; noPhone?: boolean; noOwner?: boolean } = {}) {
  const writes: { table: string; value: any }[] = [];
  const queries: { table: string; field: string; value: unknown }[] = [];
  const sb = { from: (table: string) => {
    let inserted = false;
    const q: any = {
      select: () => q,
      eq: (field: string, value: unknown) => { queries.push({ table, field, value }); return q; },
      insert: (value: any) => { inserted = true; writes.push({ table, value }); return q; },
      update: (value: any) => { writes.push({ table, value }); return q; },
      maybeSingle: async () => ({ data:
        table === "users" ? { phone: options.noPhone ? null : "0712345678" } :
        table === "meters" ? (options.noOwner ? {} : { landlord_id: "landlord", vendor_id: "vendor" }) :
        table === "vendor_sms_configurations" ? (options.disabled ? null : {
          sms_configuration_id: "provider", api_key: "test-key", sender_id: "SmatraPay",
          api_url: "https://sms.example.test/send", default_country_code: "254", message_type: 1,
        }) : { id: "provider", is_active: true, provider_code: "tiara" }, error: null }),
      single: async () => ({ data: inserted ? { id: "log-1" } : null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    };
    return q;
  } };
  return { sb, writes, queries };
}
afterEach(() => vi.unstubAllGlobals());
describe("customer job SMS", () => {
  it.each(["in_progress", "resolved", "cancelled"] as const)("sends a real HTTP request for %s and records submission", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "SUCCESS", statusCode: 0, msgId: "msg-1" })));
    vi.stubGlobal("fetch", fetcher);
    const db = database();
    const result = await sendJobStatusSms(db.sb, job, status, "provider-user", "event-1");
    expect(result.status).toBe("submitted");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.to).toBe("254712345678");
    expect(body.refId).toBe("job-event-1");
    expect(db.queries).toContainEqual({ table: "vendor_sms_configurations", field: "vendor_id", value: "landlord" });
    expect(db.writes).toContainEqual({ table: "sms_messages", value: expect.objectContaining({ status: "submitted", provider_message_id: "msg-1" }) });
    expect(JSON.stringify(result)).not.toContain("test-key");
  });
  it("does not fall back to the vendor when meter owner SMS is disabled", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const db = database({ disabled: true });
    expect((await sendJobStatusSms(db.sb, job, "resolved", "actor", "event")).status).toBe("failed");
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.queries).not.toContainEqual({ table: "vendor_sms_configurations", field: "vendor_id", value: "vendor" });
  });
  it("returns a safe failure without throwing when the SMS provider rejects a request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret echoed", { status: 401 })));
    const db = database();
    const result = await sendJobStatusSms(db.sb, job, "cancelled", "actor", "event");
    expect(result.status).toBe("failed");
    expect(db.writes).toContainEqual({ table: "sms_messages", value: expect.objectContaining({ status: "failed" }) });
    expect(JSON.stringify(result)).not.toContain("secret echoed");
  });
  it("does not send without a customer phone", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await sendJobStatusSms(database({ noPhone: true }).sb, job, "resolved", "actor", "event")).status).toBe("failed");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not claim submission for HTTP success containing a provider failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "FAILED", statusCode: 1 }))));
    expect((await sendJobStatusSms(database().sb, job, "in_progress", "actor", "event")).status).toBe("failed");
  });
});