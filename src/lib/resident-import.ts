import { z } from "zod";
import { parseCsv } from "./unit-bulk";

export const residentImportRow = z.object({
  name: z.string().trim().min(2).max(180),
  email: z.string().trim().email().max(255).transform(v => v.toLowerCase()),
  unit: z.string().trim().min(1).max(200),
  property: z.string().trim().min(1).max(200),
});
export type ResidentImportInput = z.infer<typeof residentImportRow>;
export type ImportUnit = { id: string; unit_number: string; property_id: string; property_name: string; status: string; occupied: boolean };
export type ResidentImportResult = { row: number; values: ResidentImportInput; status: "ready" | "successful" | "skipped" | "failed"; reason: string; unitId?: string; propertyId?: string };

export function parseResidentImport(text: string): ResidentImportInput[] {
  const [header, ...rows] = parseCsv(text);
  const columns = header?.map(v => v.trim().toLowerCase()) ?? [];
  if (columns.length !== 4 || new Set(columns).size !== 4 || !["name", "email", "unit", "property"].every(v => columns.includes(v))) throw new Error("Required CSV columns: Name, Email, Unit, Property");
  if (!rows.length || rows.length > 200) throw new Error("Choose a CSV with 1–200 residents.");
  return rows.map(cells => {
    if (cells.length !== 4) throw new Error("Each CSV row must contain four values.");
    const value = (key: string) => (cells[columns.indexOf(key)] ?? "").trim();
    return { name: value("name"), email: value("email"), unit: value("unit"), property: value("property") };
  });
}

export function validateResidentImport(rows: ResidentImportInput[], units: ImportUnit[]): ResidentImportResult[] {
  const emails = new Set<string>(), slots = new Set<string>();
  const match = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return rows.map((values, index) => {
    const result: ResidentImportResult = { row: index + 2, values, status: "failed", reason: "" };
    const parsed = residentImportRow.safeParse(values);
    if (!parsed.success) return { ...result, reason: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") };
    result.values = parsed.data;
    if (emails.has(parsed.data.email)) return { ...result, reason: "Duplicate email in this file" };
    emails.add(parsed.data.email);
    const found = units.filter(u => (match(u.property_id, values.property) || match(u.property_name, values.property)) && (match(u.id, values.unit) || match(u.unit_number, values.unit)));
    if (found.length !== 1) return { ...result, reason: "Unit/property not found, ambiguous or outside your scope; use existing IDs or exact names" };
    const unit = found[0];
    if (!unit) return result;
    if (slots.has(unit.id)) return { ...result, reason: "Duplicate unit in this file" };
    slots.add(unit.id);
    result.unitId = unit.id; result.propertyId = unit.property_id;
    if (unit.occupied || ["occupied", "archived", "maintenance"].includes(unit.status)) return { ...result, reason: "Unit is occupied or unavailable" };
    return { ...result, status: "ready", reason: "Ready to create and assign" };
  });
}

export function residentImportCsv(rows: string[][]) {
  return "\uFEFF" + rows.map(row => row.map(v => `"${(/^[=+@\-\t\r]/.test(v) ? "'" : "") + v.replace(/"/g, '""')}"`).join(",")).join("\r\n");
}