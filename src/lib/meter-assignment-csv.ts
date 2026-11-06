import { z } from "zod";
import { parseCsv } from "@/lib/unit-bulk";

export const ASSIGNMENT_COLUMNS = ["Meter", "Type", "Resident", "Unit", "Property"] as const;
export const ASSIGNMENT_LIMIT = 200;
export type CsvValues = Record<(typeof ASSIGNMENT_COLUMNS)[number], string>;
export type CsvRow = { row: number; values: CsvValues; error?: string };
export type AssignmentRow = CsvRow & { status: "ready" | "skipped" | "failed" | "successful"; reason: string; target?: { meter: string; unit: string; property: string; resident: string | null; type: string } };
export type References = {
  properties: { id: string; name: string; code: string | null; status: string }[];
  units: { id: string; number: string; propertyId: string; status: string; electricity: string | null; water: string | null; gas: string | null }[];
  meters: { id: string; number: string; type: string; unitId: string | null; status: string }[];
  occupied: { unitId: string; type: string }[];
  residents: { id: string; name: string | null; email: string | null; status: string; unitId: string }[];
};
export const assignmentRequest = z.object({
  portal: z.enum(["admin", "vendor"]), propertyId: z.string().uuid().nullable(),
  csv: z.string().min(1).max(1024 * 1024), confirm: z.boolean().default(false),
});
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
export function parseAssignmentCsv(text: string): CsvRow[] {
  // Reject incomplete quoted fields instead of silently accepting a damaged file.
  let quoted = false;
  for (let i = 0; i < text.length; i++) if (text[i] === '"') {
    if (quoted && text[i + 1] === '"') i++; else quoted = !quoted;
  }
  if (quoted) throw new Error("Unclosed quoted field in CSV");
  const table = parseCsv(text);
  const header = table.shift();
  if (!header || header.length !== 5 || header.some((h, i) => h.trim() !== ASSIGNMENT_COLUMNS[i])) throw new Error("Columns must be exactly: Meter, Type, Resident, Unit, Property (in this order)");
  if (!table.length) throw new Error("Add at least one data row");
  if (table.length > ASSIGNMENT_LIMIT) throw new Error(`Maximum ${ASSIGNMENT_LIMIT} rows per import`);
  return table.map((cells, i) => ({ row: i + 2, values: Object.fromEntries(ASSIGNMENT_COLUMNS.map((c, j) => [c, (cells[j] ?? "").trim()])) as CsvValues, ...(cells.length !== 5 ? { error: "Expected five values" } : {}) }));
}
function find<T extends { id: string }>(rows: T[], value: string, aliases: (r: T) => (string | null)[]): T | undefined {
  const id = rows.find(r => norm(r.id) === norm(value));
  if (id) return id;
  const matches = rows.filter(r => aliases(r).some(a => norm(a) === norm(value)));
  const unique = [...new Map(matches.map(r => [r.id, r])).values()];
  return unique.length === 1 ? unique[0] : undefined;
}
export function validateAssignments(rows: CsvRow[], refs: References, propertyId: string | null): AssignmentRow[] {
  const seen = new Map<string, number>(), slots = new Map<string, number>();
  return rows.map(row => {
    const fail = (reason: string): AssignmentRow => ({ ...row, status: "failed", reason });
    if (row.error) return fail(row.error);
    for (const col of ASSIGNMENT_COLUMNS) if (col !== "Resident" && col !== "Property" && !row.values[col]) return fail(`${col} is required`);
    const v = row.values;
    if (!["electricity", "water", "gas"].includes(norm(v.Type))) return fail("Type must be Electricity, Water or Gas");
    const meter = find(refs.meters, v.Meter, m => [m.number]);
    if (!meter) return fail("Meter not found, ambiguous or outside your scope; use its ID or exact meter number");
    const first = seen.get(meter.id);
    if (first !== undefined) return { ...row, status: "skipped", reason: `Duplicate meter (row ${first})` };
    seen.set(meter.id, row.row);
    if (norm(meter.type) !== norm(v.Type)) return fail("Type does not match the meter's actual type");
    // Property is optional: blank resolves the property from the unit.
    let property = v.Property ? find(refs.properties, v.Property, p => [p.code, p.name]) : undefined;
    if (v.Property && (!property || (propertyId && property.id !== propertyId))) return fail("Property not found, ambiguous or outside selected scope; use its ID or leave Property blank");
    const scopeId = property?.id ?? propertyId;
    const unit = find(refs.units.filter(u => !scopeId || u.propertyId === scopeId), v.Unit, u => [u.number]);
    if (!unit) return fail(property ? "Unit not found or ambiguous in this property; use its ID" : "Unit not found or ambiguous; use its ID or add Property");
    property = property ?? refs.properties.find(p => p.id === unit.propertyId);
    if (!property) return fail("Property for this unit is outside your scope");
    // Resident is optional: blank assigns the meter to the unit only.
    const resident = v.Resident ? find(refs.residents, v.Resident, r => [r.email, r.name]) : null;
    if (v.Resident && !resident) return fail("Resident not found, ambiguous or outside your scope; use email or ID, or leave Resident blank");
    if (resident && !refs.residents.some(r => r.id === resident.id && r.unitId === unit.id)) return fail("Resident is not currently assigned to this unit/property");
    if (norm(meter.status) !== "active" || (resident && norm(resident.status) !== "active") || property.status === "archived" || ["archived", "maintenance"].includes(unit.status)) return fail("Meter, resident, unit or property is not eligible/active");
    const recorded = unit[norm(v.Type) as "electricity" | "water" | "gas"];
    if (recorded && norm(recorded) !== norm(meter.number)) return fail("Unit has a different meter number recorded for this type");
    const target = { meter: meter.id, unit: unit.id, property: property.id, resident: resident?.id ?? null, type: meter.type };
    if (meter.unitId === unit.id) return { ...row, target, status: "skipped", reason: "Already assigned to this unit" };
    if (meter.unitId) return fail("Meter already assigned elsewhere; use Change assignment");
    if (refs.occupied.some(m => m.unitId === unit.id && norm(m.type) === norm(meter.type))) return fail("Unit already has a meter of this type");
    const key = `${unit.id}:${norm(meter.type)}`;
    if (slots.has(key)) return fail(`Another row (${slots.get(key)}) targets this unit and meter type`);
    slots.set(key, row.row);
    return { ...row, target, status: "ready", reason: "References validated; ready to assign" };
  });
}
export function csvCell(value: string | number): string {
  const s = String(value);
  return '"' + (/^[=+@\-\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
}
export function assignmentCsv(rows: CsvValues[]): string {
  return ASSIGNMENT_COLUMNS.join(",") + "\r\n" + rows.map(r => ASSIGNMENT_COLUMNS.map(c => csvCell(r[c])).join(",")).join("\r\n") + "\r\n";
}
export function assignmentErrorCsv(rows: AssignmentRow[]): string {
  return [ ["Row", ...ASSIGNMENT_COLUMNS, "Status", "Reason"].join(","), ...rows.filter(r => r.status !== "successful" && r.status !== "ready").map(r => [r.row, ...ASSIGNMENT_COLUMNS.map(c => r.values[c]), r.status, r.reason].map(csvCell).join(",")) ].join("\r\n") + "\r\n";
}