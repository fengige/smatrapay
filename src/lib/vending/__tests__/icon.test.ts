import { describe, expect, it, vi, afterEach } from "vitest";
import { iconNumber, iconUnits, iconVendingService } from "../icon.server";

const creds = { api_pos_purchase: "https://icon.test/creditToken", api_login: null, api_maintenance_clear_tamper: null, api_maintenance_clear_credit: null, api_maintenance_set_overdraft_limit: null, api_company_name: null, api_user_name: null, api_password: null, api_taas_id: "id", api_taas_password: "pw" };
const req = { action: "credit" as const, meter_number: "14503441157", amount: 10, units: 0, vend_by_unit: false, price_per_unit: 100 };
afterEach(() => vi.restoreAllMocks());

describe("Icon-Token", () => {
  it("KES 10 at KES 100/unit is 0.1 units", () => {
    expect(iconUnits(10, 100)).toBe(0.1);
    expect(iconNumber(0.1, 4)).toBe("0.1");
  });
  it("sends drn, calculated units and amount as strings", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ResultCode: "0", ResultDesc: "Accepted", TOKEN: "1129 6094 0444 4942 5974" })));
    const { outcome, log } = await iconVendingService.execute(req, creds);
    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ drn: "14503441157", units: "0.1", unitsAmount: "10", taasid: "id", taaspasswd: "pw" });
    expect(outcome.ok).toBe(true);
    expect(JSON.stringify(log)).not.toContain("pw");
  });
  it("AUTH FAILED is a failure, never a token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ResultCode: "IT00010", ResultDesc: "AUTH FAILED" })));
    const { outcome } = await iconVendingService.execute(req, creds);
    expect(outcome.ok).toBe(false);
  });
  it("timeout shows the verify-before-retry message", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" }));
    const { outcome } = await iconVendingService.execute(req, creds);
    expect(outcome.ok === false && outcome.message).toBe("Unable to contact Icon-Token. Please verify the transaction status before retrying.");
  });
  it("never sends zero units", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const { outcome } = await iconVendingService.execute({ ...req, amount: 0 }, creds);
    expect(outcome.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
