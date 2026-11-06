import { describe, expect, it } from "vitest";
import { assignmentErrorCsv, parseAssignmentCsv, validateAssignments, assignmentRequest, type References, type CsvRow } from "../meter-assignment-csv";
const refs: References = {
  properties: [{ id: "p", name: "Home", code: "001", status: "active" }],
  units: [{ id: "u", number: "001", propertyId: "p", status: "active", electricity: null, water: null, gas: null }],
  meters: [{ id: "m", number: "00123", type: "Water", unitId: null, status: "active" }],
  residents: [{ id: "r", name: "Mary", email: "mary@example.test", status: "active", unitId: "u" }], occupied: [],
};
const row: CsvRow = { row: 2, values: { Meter: "00123", Type: "Water", Resident: "mary@example.test", Unit: "001", Property: "001" } };
const validate = (r = refs, rows = [row], property: string | null = null) => validateAssignments(rows, r, property);
describe("bulk meter assignment references", () => {
  it("requires the exact five columns in order and preserves leading zeros", () => {
    expect(parseAssignmentCsv("Meter,Type,Resident,Unit,Property\r\n00123,Water,mary@example.test,001,001")[0]?.values.Meter).toBe("00123");
    expect(() => parseAssignmentCsv("Type,Meter,Resident,Unit,Property\nWater,00123,r,u,p")).toThrow();
  });
  it("resolves existing names/identifiers without creating records", () => { expect(validate()[0]?.target).toEqual({ meter: "m", unit: "u", property: "p", resident: "r", type: "Water" }); });
  it("allows a blank Resident and assigns to the unit only", () => { const r = validate(refs, [{ ...row, values: { ...row.values, Resident: "" } }])[0]; expect(r?.status).toBe("ready"); expect(r?.target?.resident).toBeNull(); });
  it("allows a blank Property and resolves it from the unit", () => { const r = validate(refs, [{ ...row, values: { ...row.values, Property: "" } }])[0]; expect(r?.status).toBe("ready"); expect(r?.target?.property).toBe("p"); });
  it("requires Meter, Type and Unit", () => { for (const field of ["Meter", "Type", "Unit"]) expect(validate(refs, [{ ...row, values: { ...row.values, [field]: "" } }])[0]?.status).toBe("failed"); });
  it("matches actual Electricity Water Gas types only", () => { for (const type of ["Electricity", "Water", "Gas"]) expect(validate({ ...refs, meters: [{ ...refs.meters[0], id: "m", number: "00123", unitId: null, status: "active", type }] }, [{ ...row, values: { ...row.values, Type: type } }])[0]?.status).toBe("ready"); expect(validate(refs, [{ ...row, values: { ...row.values, Type: "Electricity" } }])[0]?.status).toBe("failed"); });
  it("rejects foreign meter references", () => { expect(validate({ ...refs, meters: [] })[0]?.status).toBe("failed"); });
  it("rejects references outside selected property scope", () => { expect(validate(refs, [row], "foreign")[0]?.status).toBe("failed"); });
  it("requires current resident relationship to the specified unit", () => { expect(validate({ ...refs, residents: [{ ...refs.residents[0], id: "r", name: "Mary", email: "mary@example.test", status: "active", unitId: "other" }] })[0]?.reason).toContain("not currently assigned"); });
  it("rejects ambiguous names", () => { expect(validate({ ...refs, properties: [...refs.properties, { id: "p2", name: "Home", code: "002", status: "active" }] }, [{ ...row, values: { ...row.values, Property: "Home" } }])[0]?.status).toBe("failed"); });
  it("skips duplicate meter rows", () => { expect(validate(refs, [row, { ...row, row: 3 }])[1]?.status).toBe("skipped"); });
  it("skips already matching assignments on retry", () => { expect(validate({ ...refs, meters: [{ id: "m", number: "00123", type: "Water", unitId: "u", status: "active" }] })[0]?.status).toBe("skipped"); });
  it("never moves an assigned meter silently", () => { expect(validate({ ...refs, meters: [{ id: "m", number: "00123", type: "Water", unitId: "other", status: "active" }] })[0]?.status).toBe("failed"); });
  it("rejects duplicate utility slots", () => { expect(validate({ ...refs, occupied: [{ unitId: "u", type: "water" }] })[0]?.status).toBe("failed"); });
  it("rejects conflicting legacy meter number", () => { expect(validate({ ...refs, units: [{ ...refs.units[0], id: "u", number: "001", propertyId: "p", status: "active", electricity: null, water: "other", gas: null }] })[0]?.status).toBe("failed"); });
  it("rejects inactive meters", () => { expect(validate({ ...refs, meters: [{ id: "m", number: "00123", type: "Water", unitId: null, status: "inactive" }] })[0]?.status).toBe("failed"); });
  it("reports row values and reason in downloadable errors", () => { const csv = assignmentErrorCsv(validate({ ...refs, meters: [] })); expect(csv).toContain('"2","00123","Water","mary@example.test","001","001","failed"'); });
  it("requires confirmation to save and strips client scope overrides", () => { const input = assignmentRequest.parse({ portal: "vendor", propertyId: null, csv: "x", vendorId: "foreign" }); expect(input.confirm).toBe(false); expect(input).not.toHaveProperty("vendorId"); });
  it("rejects damaged CSV and rows with extra values", () => { expect(() => parseAssignmentCsv('Meter,Type,Resident,Unit,Property\n"00123,Water,r,u,p')).toThrow(); expect(parseAssignmentCsv('Meter,Type,Resident,Unit,Property\n00123,Water,r,u,p,extra')[0]?.error).toBe("Expected five values"); });
});