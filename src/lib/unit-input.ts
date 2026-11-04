import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).nullable().optional();

/** Shared Unit Management validation for admin and vendor creation. */
export const unitInput = z.object({
  property_id: z.string().uuid(),
  unit_number: z.string().trim().min(1).max(40),
  building: text(120),
  unit_type: text(60),
  bedrooms: z.number().int().min(0).max(50).nullable().optional(),
  floor: text(30),
  status: z.enum(["vacant", "occupied", "maintenance", "archived"]).optional(),
  notes: text(1000),
  electricity_meter_no: text(60),
  water_meter_no: text(60),
  gas_meter_no: text(60),
});

export type UnitInput = z.infer<typeof unitInput>;