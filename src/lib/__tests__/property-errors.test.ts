import { describe, expect, it } from "vitest";
import { propertyWriteErrorMessage } from "../property-errors";

describe("property duplicate handling", () => {
  it("handles the property-name conflict without exposing the constraint", () => {
    const message = propertyWriteErrorMessage({
      code: "23505",
      message: 'duplicate key value violates unique constraint "properties_name_key"',
    });
    expect(message).toBe("This property name is already in use. Please choose a different name.");
    expect(message).not.toContain("properties_name_key");
  });
  it("handles other uniqueness conflicts without naming internal constraints", () => {
    expect(propertyWriteErrorMessage({ code: "23505", message: "properties_pkey" }))
      .toBe("A property with these details already exists. Please check your entries.");
  });
  it("preserves unrelated errors", () => {
    expect(propertyWriteErrorMessage({ code: "42501", message: "Access denied" })).toBe("Access denied");
  });
});