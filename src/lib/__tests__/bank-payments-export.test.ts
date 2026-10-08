import { describe, expect, it } from "vitest";
import { EXPORT_COLUMNS, exportFilename } from "@/lib/bank-payments-export";

describe("bank payments export", () => {
  it("names files by today's date without a range", () => {
    expect(exportFilename("csv", "", "", "2026-10-08")).toBe("bank-payments-2026-10-08.csv");
  });
  it("uses the selected date range in the filename", () => {
    expect(exportFilename("xlsx", "2026-10-01", "2026-10-08", "2026-10-09")).toBe("bank-payments-2026-10-01_to_2026-10-08.xlsx");
  });
  it("never exports the vend token", () => {
    expect(EXPORT_COLUMNS.map((c) => c.header)).not.toContain("Token");
  });
});
