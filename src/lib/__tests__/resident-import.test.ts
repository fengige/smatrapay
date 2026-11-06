import { describe, expect, it } from "vitest";
import { parseResidentImport, validateResidentImport, residentImportCsv } from "../resident-import";
const row = {name:"Mary Test",email:"MARY@example.test",unit:"A1",property:"River"};
const units = [{id:"u1",unit_number:"A1",property_id:"p1",property_name:"River",status:"active",occupied:false}];
describe("vendor resident CSV rules",()=>{
  it("parses requested columns and quoted names",()=>expect(parseResidentImport('Name,Email,Unit,Property\n"Mary, Test",mary@example.test,A1,River')[0]?.name).toBe("Mary, Test"));
  it("requires all four fields",()=>{for(const key of ["name","email","unit","property"]){expect(validateResidentImport([{...row,[key]:""}],units)[0]?.status).toBe("failed");}});
  it("resolves exact scoped references and normalizes email",()=>{const r=validateResidentImport([row],units)[0];expect(r?.unitId).toBe("u1");expect(r?.values.email).toBe("mary@example.test");expect(r?.status).toBe("ready");});
  it("rejects foreign references",()=>expect(validateResidentImport([{...row,property:"Foreign"}],units)[0]?.status).toBe("failed"));
  it("rejects ambiguous unit/property names",()=>expect(validateResidentImport([row],[...units,{...units[0],id:"u2"}])[0]?.status).toBe("failed"));
  it("rejects duplicate emails case-insensitively",()=>expect(validateResidentImport([row,{...row,email:"mary@example.test"}],units)[1]?.reason).toBe("Duplicate email in this file"));
  it("rejects duplicate unit assignments",()=>expect(validateResidentImport([row,{...row,email:"other@example.test"}],units)[1]?.reason).toBe("Duplicate unit in this file"));
  it("rejects occupied units",()=>expect(validateResidentImport([row],[{...units[0],occupied:true}])[0]?.status).toBe("failed"));
  it("rejects CSV scope override columns",()=>expect(()=>parseResidentImport("Name,Email,Unit,Property,vendor_id\na,b,c,d,e")).toThrow());
  it("limits import to 200 residents",()=>expect(()=>parseResidentImport("Name,Email,Unit,Property\n"+Array(201).fill("Mary,mary@example.test,A1,River").join("\n"))).toThrow());
  it("neutralizes spreadsheet formulas in error downloads",()=>expect(residentImportCsv([["=1+1"]])).toContain("'=1+1"));
});