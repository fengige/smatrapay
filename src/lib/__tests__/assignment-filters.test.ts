import { describe, expect, it } from "vitest";
import { DEFAULT_ASSIGNMENT_FILTER, matchesAssignmentFilter, scopedPropertyOptions } from "../assignment-filters";

const meters = [
  { property_id: "p1", property_name: "Alpha", type: "Water" },
  { property_id: "p1", property_name: "Alpha", type: "electricity" },
  { property_id: "p2", property_name: "Beta", type: "water" },
  { property_id: null, property_name: null, type: "gas" },
];

describe("assignment filters", () => {
  it("defaults show every record", () => {
    expect(meters.filter((m) => matchesAssignmentFilter(m, DEFAULT_ASSIGNMENT_FILTER))).toHaveLength(4);
  });
  it("combines property and meter type", () => {
    const f = { propertyMode: "specific" as const, propertyId: "p1", meterType: "water" };
    expect(meters.filter((m) => matchesAssignmentFilter(m, f))).toEqual([meters[0]]);
  });
  it("specific mode without a chosen property keeps all", () => {
    const f = { propertyMode: "specific" as const, propertyId: "", meterType: "all" };
    expect(meters.filter((m) => matchesAssignmentFilter(m, f))).toHaveLength(4);
  });
  it("property options come only from scoped records", () => {
    expect(scopedPropertyOptions(meters)).toEqual([
      { id: "p1", name: "Alpha" },
      { id: "p2", name: "Beta" },
    ]);
  });
});
