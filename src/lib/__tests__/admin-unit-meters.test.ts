import { describe, expect, it } from "vitest";
import { withAssignedMeterNumbers } from "@/lib/admin-unit-meters";

describe("administrator unit assigned meters", () => {
  it.each([
    ["Electricity", "electricity_meter_no", "00123"],
    ["Water", "water_meter_no", "00456"],
    ["Gas", "gas_meter_no", "00789"],
  ])("maps assigned %s meters to their unit column", (type, column, number) => {
    const rows = withAssignedMeterNumbers([{ id: "a" }, { id: "b" }], [
      { unit_id: "a", type, meter_number: number },
      { unit_id: "b", type, meter_number: "99999" },
      { unit_id: null, type, meter_number: "88888" },
    ]);
    expect(rows[0]).toHaveProperty(column, number);
    expect(rows[1]).toHaveProperty(column, "99999");
  });

  it("clears stale legacy numbers when no meter is assigned", () => {
    expect(withAssignedMeterNumbers([
      { id: "a", electricity_meter_no: "old", water_meter_no: "old", gas_meter_no: "old" },
    ], [])[0]).toMatchObject({ electricity_meter_no: null, water_meter_no: null, gas_meter_no: null });
  });

  it("shows every assigned meter of the same type without duplicates", () => {
    const meters = ["00002", "00001", "00002"].map((meter_number) => ({
      unit_id: "a", type: "Electricity", meter_number,
    }));
    expect(withAssignedMeterNumbers([{ id: "a" }], meters)[0]?.electricity_meter_no).toBe("00001, 00002");
  });

  it("reflects reassignment on the next read", () => {
    const units = [{ id: "a" }, { id: "b" }];
    const before = withAssignedMeterNumbers(units, [{ unit_id: "a", type: "Water", meter_number: "00456" }]);
    const after = withAssignedMeterNumbers(units, [{ unit_id: "b", type: "Water", meter_number: "00456" }]);
    expect(before[0]?.water_meter_no).toBe("00456");
    expect(after[0]?.water_meter_no).toBeNull();
    expect(after[1]?.water_meter_no).toBe("00456");
  });
});