import { z } from "zod";
import { parseCsv } from "@/lib/unit-bulk";
import { unitInput } from "@/lib/unit-input";

export const ADMIN_UNIT_CSV_COLUMNS = {
  UnitName: "unit_number", UnitType: "unit_type", Floor: "floor",
  "Electricity meter": "electricity_meter_no", "Water meter": "water_meter_no",
  "Gas meter": "gas_meter_no", Status: "status", Notes: "notes",
} as const;

export const ADMIN_UNIT_CSV_TEMPLATE = Object.keys(ADMIN_UNIT_CSV_COLUMNS).join(",") + "\r\n";

export function parseAdminUnitCsv(text: string): Record<string, string | null>[] {
  const table = parseCsv(text);
  const first = table[0];
  if (!first || table.length < 2) throw new Error("The CSV needs a header row and at least one data row");
  const columns = Object.entries(ADMIN_UNIT_CSV_COLUMNS);
  const header = first.map((h) => {
    const match = columns.find(([label]) => label.toLowerCase() === h.trim().toLowerCase());
    if (!match) throw new Error(`Unsupported column: ${h}`);
    return match[1];
  });
  if (!header.includes("unit_number")) throw new Error("Missing required column: UnitName");
  if (new Set(header).size !== header.length) throw new Error("Duplicate CSV columns are not allowed");
  return table.slice(1).map((cells, index) => {
    if (cells.length > header.length) throw new Error(`Row ${index + 1}: too many columns`);
    return Object.fromEntries(header.map((key, i) => [key, cells[i]?.trim() || null]));
  });
}

/** Reuse Unit Management lengths and fields; only this import defaults to active. */
export const adminUnitImportRow = unitInput.extend({
  unit_number: z.string({ required_error: "UnitName is required", invalid_type_error: "UnitName is required" }).trim().min(1, "UnitName is required").max(40),
  status: z.preprocess(
    (value) => typeof value === "string" ? value.trim().toLowerCase() || "active" : value == null ? "active" : value,
    z.enum(["active", "vacant", "occupied", "maintenance", "archived"]),
  ),
});