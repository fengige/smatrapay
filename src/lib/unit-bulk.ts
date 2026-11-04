import { unitInput, type UnitInput } from "@/lib/unit-input";

/** Exact CSV columns supported for unit import (mirrors Unit Management fields). */
export const UNIT_CSV_HEADERS = [
  "unit_number", "building", "unit_type", "bedrooms", "floor", "status",
  "electricity_meter_no", "water_meter_no", "gas_meter_no", "notes",
] as const;
export const UNIT_BULK_MAX = 200;

export type UnitRowValues = Partial<Record<(typeof UNIT_CSV_HEADERS)[number], string>>;
export type ValidatedRow = { row: number; input: UnitInput | null; errors: string[] };

export function unitCsvTemplate(): string {
  return [
    UNIT_CSV_HEADERS.join(","),
    'A1,Block A,1 Bedroom,1,Ground,vacant,14503254824,,,"Required: unit_number. status: vacant|occupied|maintenance|archived"',
  ].join("\r\n") + "\r\n";
}

/** RFC 4180-style CSV parsing (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/** Parse CSV text into row values; returns a header error when columns are unsupported. */
export function csvToUnitRows(text: string): { rows: UnitRowValues[]; error?: string } {
  const all = parseCsv(text);
  if (all.length === 0) return { rows: [], error: "The file is empty." };
  const header = all[0]!.map((h) => h.trim().toLowerCase());
  const unknown = header.filter((h) => h && !(UNIT_CSV_HEADERS as readonly string[]).includes(h));
  if (unknown.length) return { rows: [], error: `Unsupported column(s): ${unknown.join(", ")}` };
  if (!header.includes("unit_number")) return { rows: [], error: "Missing required column: unit_number" };
  const rows = all.slice(1).map((cells) => {
    const r: UnitRowValues = {};
    header.forEach((h, i) => { if (h) r[h as keyof UnitRowValues] = (cells[i] ?? "").trim(); });
    return r;
  });
  return { rows };
}

const blankToNull = (v?: string) => (v == null || v.trim() === "" ? null : v.trim());

/** Validate rows with the shared unit schema plus in-batch/existing duplicate checks. */
export function validateUnitRows(
  propertyId: string, rows: UnitRowValues[], existingUnitNumbers: string[] = [],
): ValidatedRow[] {
  const existing = new Set(existingUnitNumbers.map((u) => u.trim().toLowerCase()));
  const seen = new Map<string, number>();
  return rows.map((r, idx) => {
    const errors: string[] = [];
    const bedroomsRaw = blankToNull(r.bedrooms);
    const bedrooms = bedroomsRaw == null ? null : Number(bedroomsRaw);
    if (bedroomsRaw != null && !Number.isInteger(bedrooms)) errors.push("bedrooms must be a whole number");
    const status = blankToNull(r.status)?.toLowerCase() ?? "vacant";
    const parsed = unitInput.safeParse({
      property_id: propertyId,
      unit_number: r.unit_number ?? "",
      building: blankToNull(r.building), unit_type: blankToNull(r.unit_type),
      bedrooms: Number.isInteger(bedrooms) ? bedrooms : null,
      floor: blankToNull(r.floor), status, notes: blankToNull(r.notes),
      electricity_meter_no: blankToNull(r.electricity_meter_no),
      water_meter_no: blankToNull(r.water_meter_no), gas_meter_no: blankToNull(r.gas_meter_no),
    });
    if (!parsed.success) {
      for (const i of parsed.error.issues) errors.push(`${i.path.join(".") || "row"}: ${i.message}`);
    }
    const key = (r.unit_number ?? "").trim().toLowerCase();
    if (key) {
      if (existing.has(key)) errors.push("unit_number already exists in this property");
      const first = seen.get(key);
      if (first != null) errors.push(`duplicate unit_number (same as row ${first})`);
      else seen.set(key, idx + 1);
    }
    return { row: idx + 1, input: errors.length || !parsed.success ? null : parsed.data, errors };
  });
}
