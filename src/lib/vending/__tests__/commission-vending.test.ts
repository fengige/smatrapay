import { beforeEach, describe, expect, it, vi } from "vitest";
import { unitsFromAmount } from "@/lib/token-units";

const state = vi.hoisted(() => ({ payer: "resident", code: "ICON", terms: null as any, token: null as any, calls: [] as any[], failInsert: false }));
const meter = { id: "meter", meter_number: "0012345", status: "active", vending_software_id: "software", supplier_id: null, price_per_unit: 10, commission_percentage: 5, vat_on_commission_percentage: 16, landlord_id: "owner", agent_id: null, vendor_id: null };
const db = {
  from(table: string) {
    let operation = "read"; let payload: any; let filter: any;
    const query: any = {
      select: () => query, eq: (key: string, value: any) => { if (key === "request_key") filter = value; return query; },
      in: () => query, insert: (v: any) => { operation = "insert"; payload = v; return query; },
      update: (v: any) => { operation = "update"; payload = v; return query; },
      single: () => query, maybeSingle: () => query,
      then(resolve: any) {
        let data: any = null;
        if (table === "meters") data = meter;
        if (table === "users") data = { name: "Owner account", email: "owner@example.test" };
        if (table === "vending_software") data = { name: state.code, code: state.code };
        if (table === "pricing_settings") data = { commission_payer: state.payer, commission_percentage: 5, vat_on_commission_percentage: 16 };
        if (table === "vending_software_api_settings") data = { api_pos_purchase: "https://provider.example.test/credit", api_company_name: "test", api_user_name: "test", api_password: "test", api_taas_id: "test", api_taas_password: "test" };
        if (table === "vending_commission_terms") {
          if (operation === "insert") state.terms = { id: "terms", ...payload };
          if (operation === "update" && state.terms) Object.assign(state.terms, payload);
          data = !filter || state.terms?.request_key === filter ? state.terms : null;
        }
        if (table === "meter_tokens") {
          if (operation === "insert" && state.failInsert) return Promise.resolve(resolve({ data: null, error: { message: "Temporary record failure" } }));
          if (operation === "insert") state.token = { id: "token", ...payload };
          data = state.token;
        }
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return query;
  },
};
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));
import { vendMeterToken } from "../vend.server";

beforeEach(() => {
  state.payer = "resident"; state.code = "ICON"; state.terms = null; state.token = null; state.calls = []; state.failInsert = false;
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body); state.calls.push(body);
    return new Response(JSON.stringify(state.code === "ICON"
      ? { ResultCode: "0", TOKEN: "1234-5678-1234-5678-1234" }
      : { result_code: 0, result: { token: "1234-5678-1234-5678-1234", total_paid: body.amount, total_unit: unitsFromAmount(body.amount, 10) } }), { status: 200 });
  }));
});
const params = { meterId: "meter", action: "credit" as const, amount: 1000, units: 0, expiresInDays: 30, actorId: null, requestId: "payment" };

describe("payer through real provider adapters and transaction persistence", () => {
  it.each(["CALIN", "ICON"])("%s records confirmed token on retry without vending or charging twice", async code => {
    state.code = code; state.payer = "owner"; state.failInsert = true;
    await expect(vendMeterToken(db, params)).rejects.toThrow("Temporary record failure");
    expect(state.terms.confirmed_vend_result.token).toBe("1234-5678-1234-5678-1234");
    state.failInsert = false; state.payer = "resident";
    const { row } = await vendMeterToken(db, params);
    expect(state.calls).toHaveLength(1);
    expect([row.net_amount, row.commission_amount, row.vat_on_commission_amount]).toEqual([1000, 50, 8]);
    expect(row.token).toBe(state.terms.confirmed_vend_result.token);
  });
  it("rejects changed amount under an already completed purchase key", async () => {
    await vendMeterToken(db, params);
    await expect(vendMeterToken(db, { ...params, amount: 2000 })).rejects.toThrow("Purchase amount or units changed");
    expect(state.calls).toHaveLength(1);
  });
  it("rejects changed fixed units under a retry key", async () => {
    state.payer = "owner";
    await vendMeterToken(db, { ...params, vendByUnit: true, units: 100 });
    await expect(vendMeterToken(db, { ...params, vendByUnit: true, units: 200 })).rejects.toThrow("Purchase amount or units changed");
    expect(state.calls).toHaveLength(1);
  });
  it.each(["CALIN", "ICON"])("%s sends 942 for Resident and persists exact deductions", async code => {
    state.code = code;
    const { row } = await vendMeterToken(db, params);
    expect(Number(state.calls[0].unitsAmount ?? state.calls[0].amount)).toBe(942);
    expect([row.amount, row.net_amount, row.commission_amount, row.vat_on_commission_amount]).toEqual([1000, 942, 50, 8]);
  });
  it.each(["CALIN", "ICON"])("%s sends full 1000 for Owner with unchanged full-payment units", async code => {
    state.code = code; state.payer = "owner";
    const { row } = await vendMeterToken(db, params);
    expect(Number(state.calls[0].unitsAmount ?? state.calls[0].amount)).toBe(1000);
    expect(row.units).toBe(unitsFromAmount(1000, 10));
    expect([row.amount, row.net_amount, row.commission_amount, row.vat_on_commission_amount]).toEqual([1000, 1000, 50, 8]);
    expect([row.commission_payer, row.commission_owner_id, row.commission_terms_id]).toEqual(["owner", "owner", "terms"]);
    state.payer = "resident";
    const replay = await vendMeterToken(db, params);
    expect(replay.reused).toBe(true); expect(state.calls).toHaveLength(1);
    expect(replay.row.commission_payer).toBe("owner");
  });
  it("failed provider call creates no transaction and retry retains original payer", async () => {
    state.payer = "owner";
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ResultCode: "IT00016", ResultDesc: "Rejected" }), { status: 200 }));
    await expect(vendMeterToken(db, params)).rejects.toThrow();
    expect(state.token).toBeNull(); expect(state.terms.commission_payer).toBe("owner");
    state.payer = "resident";
    const { row } = await vendMeterToken(db, params);
    expect(row.net_amount).toBe(1000); expect(row.commission_payer).toBe("owner");
  });
});