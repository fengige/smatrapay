import { describe, expect, it } from "vitest";
import { adminUnitImportRow, parseAdminUnitCsv } from "@/lib/admin-unit-csv";

const property_id = "11111111-1111-4111-8111-111111111111";
describe("administrator unit CSV rules", () => {
  it("requires UnitName in the header", () => {
    expect(() => parseAdminUnitCsv("Status\nactive")).toThrow(/UnitName/);
  });
  it("requires UnitName in each row", () => {
    const row = parseAdminUnitCsv("UnitName,Notes\n,missing name")[0];
    expect(adminUnitImportRow.safeParse({ ...row, property_id }).success).toBe(false);
  });
  it("accepts only UnitName and defaults Status to active", () => {
    const row = parseAdminUnitCsv("UnitName\n001")[0];
    expect(adminUnitImportRow.parse({ ...row, property_id })).toMatchObject({ unit_number: "001", status: "active" });
  });
  it("defaults blank Status to active", () => {
    expect(adminUnitImportRow.parse({ property_id, unit_number: "A1", status: null }).status).toBe("active");
    expect(adminUnitImportRow.parse({ property_id, unit_number: "A1", status: " " }).status).toBe("active");
  });
  it("maps optional fields and preserves leading zeros and quoted notes", () => {
    const row = parseAdminUnitCsv('UnitName,UnitType,Floor,Electricity meter,Water meter,Gas meter,Status,Notes\r\nA1,Studio,0,00123,00456,00789,occupied,"Hello, home"')[0];
    expect(adminUnitImportRow.parse({ ...row, property_id })).toMatchObject({ unit_type: "Studio", floor: "0", electricity_meter_no: "00123", water_meter_no: "00456", gas_meter_no: "00789", status: "occupied", notes: "Hello, home" });
  });
  it("rejects unsupported status values", () => {
    expect(adminUnitImportRow.safeParse({ property_id, unit_number: "A1", status: "sold" }).success).toBe(false);
  });
});