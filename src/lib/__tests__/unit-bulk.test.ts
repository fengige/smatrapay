import { describe, expect, it } from "vitest";
import { csvToUnitRows, unitCsvTemplate, UNIT_CSV_HEADERS, validateUnitRows } from "@/lib/unit-bulk";

const P = "11111111-1111-4111-8111-111111111111";

describe("unit bulk import", () => {
  it("template has exact headers and a valid example row", () => {
    const { rows, error } = csvToUnitRows(unitCsvTemplate());
    expect(error).toBeUndefined();
    expect(unitCsvTemplate().split("\r\n")[0]).toBe(UNIT_CSV_HEADERS.join(","));
    expect(validateUnitRows(P, rows)[0]!.errors).toEqual([]);
  });
  it("rejects unknown columns", () => {
    expect(csvToUnitRows("unit_number,rent\nA1,5").error).toMatch(/rent/);
  });
  it("requires unit_number", () => {
    const [r] = validateUnitRows(P, [{ unit_number: "" }]);
    expect(r!.errors.length).toBeGreaterThan(0);
  });
  it("flags duplicates in batch case-insensitively", () => {
    const v = validateUnitRows(P, [{ unit_number: "A1" }, { unit_number: "a1 " }]);
    expect(v[0]!.errors).toEqual([]);
    expect(v[1]!.errors[0]).toMatch(/row 1/);
  });
  it("flags units already in the property", () => {
    expect(validateUnitRows(P, [{ unit_number: "B2" }], ["b2"])[0]!.errors[0]).toMatch(/already exists/);
  });
  it("assigns the selected property to every row", () => {
    expect(validateUnitRows(P, [{ unit_number: "C3" }])[0]!.input!.property_id).toBe(P);
  });
  it("rejects bad bedrooms and status", () => {
    const [r] = validateUnitRows(P, [{ unit_number: "D4", bedrooms: "2.5", status: "sold" }]);
    expect(r!.errors.length).toBe(2);
  });
});
