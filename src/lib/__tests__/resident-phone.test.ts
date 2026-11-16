import { describe, expect, it, vi } from "vitest";
import { normalizeResidentPhone, phoneHash, randomPhoneCode, residentPhoneVerification, PHONE_LOGIN_ERROR } from "../resident-phone";
import { deliverResidentPhoneCode, limitResidentPhone, requestResidentPhoneCode, verifyResidentPhoneCode } from "../resident-phone.server";

describe("registered resident phone OTP", () => {
  it.each(["0712345678", "712345678", "+254712345678", "254712345678", "00254712345678", "(0712) 345-678"])("normalizes Kenya format %s", value => expect(normalizeResidentPhone(value)).toBe("+254712345678"));
  it("supports Kenya 01 mobile numbers", () => expect(normalizeResidentPhone("0112345678")).toBe("+254112345678"));
  it.each(["", "phone", "2540712345678", "0712", "+254212345678", "0712345678%"])("rejects invalid input %s", value => expect(() => normalizeResidentPhone(value)).toThrow());
  it("accepts only six-digit verification codes and opaque UUID challenges", () => {
    expect(residentPhoneVerification.safeParse({ challenge: crypto.randomUUID(), code: "123456" }).success).toBe(true);
    expect(residentPhoneVerification.safeParse({ challenge: "resident-id", code: "12345" }).success).toBe(false);
  });
  it("generates six-digit codes and challenge-bound hashes", async () => {
    expect(randomPhoneCode()).toMatch(/^\d{6}$/);
    expect(await phoneHash("first:123456")).not.toBe(await phoneHash("second:123456"));
  });
  it("enforces 60-second resend cooldown and account/IP windows server-side", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: true }) };
    await limitResidentPhone(db, "send", "+254712345678", "test-ip");
    expect(db.rpc.mock.calls.map(c => [c[1].p_limit, c[1].p_window])).toEqual([[1, 60], [3, 900], [10, 900]]);
    expect(db.rpc.mock.calls.every(c => c[1].p_key.length === 64 && !c[1].p_key.includes("712345678"))).toBe(true);
  });
  it("denies throttled requests before lookup or delivery", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: false }) }; const deliver = vi.fn();
    await expect(requestResidentPhoneCode(db, "+254712345678", "ip", deliver)).rejects.toThrow("Too many attempts");
    expect(deliver).not.toHaveBeenCalled(); expect(db.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["unknown", "inactive", "duplicate"])("returns no account information or SMS for %s", async () => {
    const db = { rpc: vi.fn(async (name: string) => ({ data: name === "find_resident_phone_account" ? [] : true })) }; const deliver = vi.fn();
    const response = await requestResidentPhoneCode(db, "+254712345678", "ip", deliver);
    expect(Object.keys(response).sort()).toEqual(["challenge", "expiresIn", "resendAfter"]);
    expect(response.expiresIn).toBe(300); expect(response.resendAfter).toBe(60); expect(deliver).not.toHaveBeenCalled();
  });
  it("sends only to the server-matched registered number and invalidates failed delivery", async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const db = { rpc: vi.fn(async (name: string) => ({ data: name === "find_resident_phone_account" ? [{ id: "existing", phone: "+254712345678" }] : true })), auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: "resident@example.test" } } }) } }, from: vi.fn().mockReturnValue({ update }) };
    const deliver = vi.fn().mockResolvedValue(false);
    const response = await requestResidentPhoneCode(db, "+254712345678", "ip", deliver);
    expect(deliver.mock.calls[0]?.[1]).toBe("+254712345678");
    expect(update.mock.calls[0]?.[0]).toEqual({ delivered: false, consumed_at: expect.any(String) });
    expect(JSON.stringify(response)).not.toContain(deliver.mock.calls[0]?.[2]);
  });
  it.each(["incorrect", "expired", "reused", "inactive"])("never establishes a session after %s challenge rejection", async () => {
    const db = { rpc: vi.fn(async (name: string) => ({ data: name === "consume_resident_phone_challenge" ? null : true })) }; const establish = vi.fn();
    await expect(verifyResidentPhoneCode(db, crypto.randomUUID(), "123456", "ip", establish)).rejects.toThrow(PHONE_LOGIN_ERROR);
    expect(establish).not.toHaveBeenCalled();
  });
  it("establishes only the resident ID returned by atomic server verification", async () => {
    const db = { rpc: vi.fn(async (name: string) => ({ data: name === "consume_resident_phone_challenge" ? "matched-resident" : true })) };
    const establish = vi.fn().mockResolvedValue({ access_token: "test", refresh_token: "test" });
    await verifyResidentPhoneCode(db, crypto.randomUUID(), "123456", "ip", establish);
    expect(establish).toHaveBeenCalledExactlyOnceWith("matched-resident");
  });
  it("records redacted history and handles provider failure without retaining the code", async () => {
    const insert = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "log" } }) }) });
    const update = vi.fn().mockReturnValue({ eq: async () => ({}) });
    const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: "config", provider_code: "tiara", api_key: "test", sender_id: "test", api_url: "https://sms.example.test" } }), insert, update };
    const db = { from: () => query };
    const result = await deliverResidentPhoneCode(db, "+254712345678", "876543", "challenge", vi.fn().mockRejectedValue(new Error("provider failure")));
    expect(result).toBe(false);
    expect(JSON.stringify(insert.mock.calls)).not.toContain("876543");
    expect(JSON.stringify(update.mock.calls)).not.toContain("876543");
  });
  it("selects TIARACONNECT and sends resident login SMS as REZICOM independently of other SMS senders", async () => {
    const insert = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "log" } }) }) });
    const query: any = { select: () => query, eq: vi.fn(() => query), maybeSingle: async () => ({ data: { id: "tiara-config", provider_code: "tiara", api_key: "test-key", sender_id: "OTHER", api_url: "https://sms.example.test" } }), insert, update: () => ({ eq: async () => ({}) }) };
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ status: "SUCCESS", statusCode: "0" })));
    expect(await deliverResidentPhoneCode({ from: () => query }, "+254712345678", "123456", "test-challenge", send)).toBe(true);
    expect(query.eq).toHaveBeenCalledWith("provider_code", "tiara");
    expect(query.eq).not.toHaveBeenCalledWith("is_default", true);
    const body = JSON.parse(String(send.mock.calls[0]?.[1]?.body));
    expect(body.from).toBe("REZICOM");
    expect(insert.mock.calls[0]?.[0].sender_id).toBe("REZICOM");
    expect(body.to).toBe("254712345678");
  });
});