import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), vend: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("@/lib/vending/vend.server", () => ({ vendMeterToken: mocks.vend }));
import { vendNcbaNotification } from "../ncba.server";

const payment = { id: "payment", status: "failed", bank: "NCBA", trans_id: "TX1", trans_amount: "5000.00", meter_number: "000053", narrative: "old-meter", mobile: null, updated_at: "2026-11-05T09:36:00Z", attempts: 2 };
function builder(result: unknown) {
  const q: any = { data: result, error: null };
  for (const name of ["select", "update", "eq"]) q[name] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => ({ data: result, error: null }));
  return q;
}

describe("bank payment vending safety", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("uses corrected meter, unchanged amount and bank transaction identity", async () => {
    mocks.from.mockImplementation((table) => builder(table === "meters" ? { id: "new-meter-id", meter_number: "000053", status: "active" } : null));
    mocks.vend.mockResolvedValue({ row: { id: "token" } });
    expect((await vendNcbaNotification("payment", { manual: true, actorId: "vendor", claimedNotification: { ...payment, status: "processing" } })).status).toBe("completed");
    expect(mocks.vend.mock.calls[0]?.[1]).toMatchObject({ meterId: "new-meter-id", amount: 5000, requestId: "ncba:TX1", reference: "TX1" });
  });
  it("a lost atomic retry claim never reaches the provider", async () => {
    let reads = 0;
    mocks.from.mockImplementation(() => builder(reads++ === 0 ? payment : null));
    expect((await vendNcbaNotification("payment", { manual: true })).status).toBe("processing");
    expect(mocks.vend).not.toHaveBeenCalled();
  });
  it("completed payments never reach the provider", async () => {
    mocks.from.mockReturnValue(builder({ ...payment, status: "completed" }));
    expect((await vendNcbaNotification("payment")).status).toBe("completed");
    expect(mocks.vend).not.toHaveBeenCalled();
  });
  it("unconfirmed Sidian payments cannot vend", async () => {
    mocks.from.mockReturnValue(builder({ ...payment, bank: "SIDIAN", payment_status: "1" }));
    expect((await vendNcbaNotification("payment", { manual: true })).message).toBe("Bank payment is not confirmed.");
    expect(mocks.vend).not.toHaveBeenCalled();
  });
});