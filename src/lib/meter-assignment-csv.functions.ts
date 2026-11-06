import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assignmentRequest, parseAssignmentCsv, validateAssignments, type References, type AssignmentRow, type CsvValues, assignmentCsv } from "@/lib/meter-assignment-csv";

const scopeInput = z.object({ portal: z.enum(["admin", "vendor"]) });
export const getAssignmentCsvScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scopeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: refs, error } = await context.supabase.rpc("meter_assignment_csv_references", { p_portal: data.portal });
    if (error) throw new Error("Unable to load assignment references for your account");
    const r = refs as unknown as References;
    return { properties: r.properties.sort((a, b) => a.name.localeCompare(b.name)) };
  });

export const exportAssignmentCsvTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scopeInput.extend({ propertyId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: raw, error } = await context.supabase.rpc("meter_assignment_csv_references", { p_portal: data.portal });
    if (error) throw new Error("Unable to load template references");
    const refs = raw as unknown as References;
    if (data.propertyId && !refs.properties.some(p => p.id === data.propertyId)) throw new Error("Property outside your scope");
    // Real, eligible examples only. Export one possible assignment, never invent records.
    let example: CsvValues | undefined;
    for (const unit of refs.units.filter(u => !data.propertyId || u.propertyId === data.propertyId)) {
      const resident = refs.residents.find(r => r.unitId === unit.id && r.status === "active");
      if (!resident) continue;
      for (const meter of refs.meters.filter(m => !m.unitId && m.status === "active")) {
        const values: CsvValues = { Meter: meter.number, Type: meter.type.slice(0, 1).toUpperCase() + meter.type.slice(1).toLowerCase(), Resident: resident.id, Unit: unit.id, Property: unit.propertyId };
        if (validateAssignments([{ row: 2, values }], refs, data.propertyId)[0]?.status === "ready") { example = values; break; }
      }
      if (example) break;
    }
    return { csv: assignmentCsv(example ? [example] : []), hasExample: Boolean(example) };
  });

export const importAssignmentCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assignmentRequest.parse(d))
  .handler(async ({ data, context }) => {
    const parsed = parseAssignmentCsv(data.csv);
    const { data: raw, error } = await context.supabase.rpc("meter_assignment_csv_references", { p_portal: data.portal });
    if (error) throw new Error("Unable to validate assignment references for your account");
    const refs = raw as unknown as References;
    if (data.propertyId && !refs.properties.some(p => p.id === data.propertyId)) throw new Error("Property outside your scope");
    const rows: AssignmentRow[] = validateAssignments(parsed, refs, data.propertyId);
    if (data.confirm) for (const row of rows) {
      if (row.status !== "ready" || !row.target) continue;
      const t = row.target;
      const { data: result, error: saveError } = await context.supabase.rpc("import_meter_unit_assignment", {
        p_portal: data.portal, p_meter: t.meter, p_unit: t.unit, p_property: t.property, p_resident: t.resident, p_type: t.type,
      });
      if (saveError) {
        row.status = "failed";
        const safe = ["Meter unavailable in your scope", "Property unavailable in your scope", "Unit unavailable in your scope", "Type does not match the meter", "Meter, unit or property is not eligible", "Resident is not active", "Resident is not currently assigned to this unit", "Unit has a different meter number recorded for this type", "Meter already assigned elsewhere; use Change assignment", "Unit already has a meter of this type"];
        row.reason = safe.includes(saveError.message) ? saveError.message : "Assignment could not be saved; refresh and retry";
      } else {
        const saved = result as { status?: string; reason?: string };
        row.status = saved.status === "successful" ? "successful" : "skipped";
        row.reason = saved.reason ?? "Already assigned";
      }
    }
    // IDs are used only within this authenticated workflow; the client cannot submit resolved targets.
    return { rows, confirmed: data.confirm };
  });