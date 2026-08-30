import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Admin access required");
}

export type TokenMeterMatch = {
  id: string;
  meter_number: string;
  serial_number: string;
  type: string;
  status: string;
  price_per_unit: number;
  sgc: number | null;
  krn: number | null;
  ti: number | null;
  ea: number | null;
  ken: number | null;
  unit_label: string | null;
  property_name: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
};

/**
 * Look a meter up by meter number, serial number, or the phone/name of the
 * resident occupying its unit. Returns owner (landlord) and customer
 * (resident) details for the token action panel.
 */
export const searchTokenMeters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ q: z.string().trim().min(2, "Enter at least 2 characters") }).parse(d),
  )
  .handler(async ({ data, context }): Promise<TokenMeterMatch[]> => {
    await assertAdmin(context as never);
    const { supabase } = context;
    const q = data.q.toLowerCase();

    // Residents matching the query, so a phone/name search finds their meters.
    const { data: people } = await supabase
      .from("users")
      .select("id, name, email, phone")
      .or(`name.ilike.%${data.q}%,phone.ilike.%${data.q}%,email.ilike.%${data.q}%`)
      .limit(25);

    const personIds = (people ?? []).map((p: any) => p.id as string);
    let unitIdsFromPeople: string[] = [];
    if (personIds.length) {
      const { data: assignments } = await supabase
        .from("unit_assignments")
        .select("unit_id, user_id, end_date")
        .in("user_id", personIds);
      unitIdsFromPeople = (assignments ?? [])
        .filter((a: any) => !a.end_date)
        .map((a: any) => a.unit_id as string);
    }

    let query = supabase
      .from("meters")
      .select(
        "id, meter_number, serial_number, type, status, price_per_unit, sgc, krn, ti, ea, ken, unit_id, landlord_id",
      )
      .limit(25);

    const filters = [`meter_number.ilike.%${data.q}%`, `serial_number.ilike.%${data.q}%`];
    if (unitIdsFromPeople.length) filters.push(`unit_id.in.(${unitIdsFromPeople.join(",")})`);
    query = query.or(filters.join(","));

    const { data: meters, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (meters ?? []) as any[];
    if (!rows.length) return [];

    const unitIds = [...new Set(rows.map((m) => m.unit_id).filter(Boolean))] as string[];
    const unitById = new Map<string, any>();
    const propertyById = new Map<string, any>();
    const residentByUnit = new Map<string, any>();

    if (unitIds.length) {
      const { data: units } = await supabase
        .from("units")
        .select("id, unit_number, property_id")
        .in("id", unitIds);
      for (const u of (units ?? []) as any[]) unitById.set(u.id, u);

      const propIds = [...new Set([...unitById.values()].map((u) => u.property_id))] as string[];
      if (propIds.length) {
        const { data: props } = await supabase
          .from("properties")
          .select("id, name")
          .in("id", propIds);
        for (const p of (props ?? []) as any[]) propertyById.set(p.id, p);
      }

      const { data: assignments } = await supabase
        .from("unit_assignments")
        .select("unit_id, user_id, end_date, role")
        .in("unit_id", unitIds);
      const residentIds = [
        ...new Set(
          (assignments ?? [])
            .filter((a: any) => !a.end_date && a.role === "resident")
            .map((a: any) => a.user_id as string),
        ),
      ];
      if (residentIds.length) {
        const { data: residents } = await supabase
          .from("users")
          .select("id, name, email, phone")
          .in("id", residentIds);
        const byId = new Map((residents ?? []).map((r: any) => [r.id, r]));
        for (const a of (assignments ?? []) as any[]) {
          if (a.end_date || a.role !== "resident") continue;
          const r = byId.get(a.user_id);
          if (r) residentByUnit.set(a.unit_id, r);
        }
      }
    }

    const landlordIds = [...new Set(rows.map((m) => m.landlord_id).filter(Boolean))] as string[];
    const landlordById = new Map<string, any>();
    if (landlordIds.length) {
      const { data: landlords } = await supabase
        .from("users")
        .select("id, name, email, phone")
        .in("id", landlordIds);
      for (const l of (landlords ?? []) as any[]) landlordById.set(l.id, l);
    }

    return rows.map((m) => {
      const unit = m.unit_id ? unitById.get(m.unit_id) : null;
      const property = unit ? propertyById.get(unit.property_id) : null;
      const resident = m.unit_id ? residentByUnit.get(m.unit_id) : null;
      const owner = m.landlord_id ? landlordById.get(m.landlord_id) : null;
      return {
        id: m.id,
        meter_number: m.meter_number,
        serial_number: m.serial_number,
        type: m.type,
        status: m.status,
        price_per_unit: Number(m.price_per_unit ?? 0),
        sgc: m.sgc,
        krn: m.krn,
        ti: m.ti,
        ea: m.ea,
        ken: m.ken,
        unit_label: unit ? `Unit ${unit.unit_number}` : null,
        property_name: property?.name ?? null,
        owner_name: owner?.name ?? null,
        owner_email: owner?.email ?? null,
        owner_phone: owner?.phone ?? null,
        customer_name: resident?.name ?? null,
        customer_email: resident?.email ?? null,
        customer_phone: resident?.phone ?? null,
      } satisfies TokenMeterMatch;
    });
  });
