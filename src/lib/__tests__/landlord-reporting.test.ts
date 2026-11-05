import {describe,it,expect,vi} from 'vitest';
import {landlordFilterSchema,decimalInteger,monthRange,groupLandlordRows,landlordTotals,type LandlordRow} from '../landlord-reporting';
import {landlordScope,readAll} from '../landlord-scope.server';
const row=(patch:Partial<LandlordRow>={}):LandlordRow=>({record_id:'a',property_id:'p',property_name:'Property',unit_name:'1',meter_number:'01',meter_type:'Electricity',trans_id:'tx',txn_at:'2026-11-05',amount_paid:1000,tokenizable_amount:942,commission_amount:50,vat_on_commission_amount:8,units:12.3,token_status:'generated',payment_status:'completed',token:'token',bank:'NCBA',vending_software:'Software',error_message:null,quantity_label:'kWh',...patch});
describe('landlord reporting rules',()=>{
 it('uses the persisted commission and VAT deduction values without changing payment precision',()=>expect(landlordTotals([row()])).toEqual({amount_paid:1000,tokenizable_amount:942,commission_amount:50,vat_on_commission_amount:8}));
 it('adds cents without floating point drift',()=>expect(landlordTotals([row({amount_paid:.1}),row({amount_paid:.2})]).amount_paid).toBe(.3));
 it('keeps failed payment money but no fabricated token amount or quantity',()=>{const r=groupLandlordRows([row({token_status:'failed',tokenizable_amount:null,units:null,commission_amount:null,vat_on_commission_amount:null})],'consumption')[0];expect(r?.amount_paid).toBe(1000);expect(r?.tokenizable_amount).toBeNull();expect(r?.units).toBeNull();expect(r?.quantity_unavailable).toBe(true);});
 it('consolidates issued quantities by meter in tenths',()=>{const r=groupLandlordRows([row({units:.1}),row({record_id:'b',units:.2})],'consumption')[0];expect(r?.units).toBe(.3);expect(r?.amount_paid).toBe(2000);});
 it('does not invent water or gas measurement units',()=>{expect(groupLandlordRows([row({meter_type:'Water',quantity_label:''})],'consumption')[0]?.units).toBeNull();});
 it('includes all linked properties in summary including properties with no transactions',()=>{const rows=groupLandlordRows([row()],'summary',[{id:'p',name:'Property'},{id:'q',name:'Other vendor property'}]);expect(rows.map(r=>r.property_id)).toEqual(['p','q']);expect(rows[1]?.tokenizable_amount).toBeNull();});
 it('does not mix properties or meters when grouping',()=>{const rows=groupLandlordRows([row(),row({record_id:'b',property_id:'q',meter_number:'02'})],'summary');expect(rows).toHaveLength(2);expect(rows[0]?.amount_paid).toBe(1000);});
 it('uses full calendar month including leap day',()=>expect(monthRange('2024-02')).toEqual({from:'2024-02-01',to:'2024-02-29'}));
 it('rejects reversed date ranges',()=>expect(landlordFilterSchema.safeParse({from:'2026-11-06',to:'2026-11-05'}).success).toBe(false));
 it('does not accept a caller-supplied landlord or vendor identity',()=>{const f=landlordFilterSchema.parse({from:'2026-11-05',to:'2026-11-05',landlordId:'foreign',vendorId:'foreign'});expect(f).not.toHaveProperty('landlordId');expect(f).not.toHaveProperty('vendorId');});
 it('preserves 1 decimal truncation for quantities',()=>expect(decimalInteger('12.39',1)).toBe(123n));
});
describe('caller-bound landlord scope',()=>{
 it('denies a vendor session before reading any property data',async()=>{const db={rpc:vi.fn().mockResolvedValue({data:false}),from:vi.fn()};await expect(landlordScope({supabase:db,userId:'vendor'})).rejects.toThrow('Landlord access required');expect(db.from).not.toHaveBeenCalled();});
 it('uses caller-bound helpers, retaining cross-vendor meters but excluding unrelated rows',async()=>{
 const tableData:any={properties:[{id:'p',name:'Owned',created_by:'vendor-a'}],units:[{id:'u',property_id:'p',unit_number:'001'}],meters:[{id:'a',unit_id:'u',meter_number:'01',vendor_id:'vendor-a'},{id:'b',unit_id:'u',meter_number:'02',vendor_id:'vendor-b'},{id:'foreign',unit_id:'u',meter_number:'03',vendor_id:'vendor-c'}]};
 const db:any={rpc:vi.fn((name:string)=>name==='has_role'?Promise.resolve({data:true}):({range:async()=>({data:name==='landlord_property_ids'?['p']:name==='landlord_unit_ids'?['u']:name==='landlord_meter_ids'?['a','b']:[{id:'vendor-a',name:'A'},{id:'vendor-b',name:'B'}]})})),from:(table:string)=>{let allowed:string[]=[];const q:any={select:()=>q,in:(_k:string,ids:string[])=>{allowed=ids;return q;},order:()=>q,range:async()=>({data:tableData[table].filter((r:any)=>allowed.includes(r.id))})};return q;}};
 const s=await landlordScope({supabase:db,userId:'landlord'});expect(s.meters.map(m=>m.id)).toEqual(['a','b']);expect(s.meters.map(m=>m.vendor_name)).toEqual(['A','B']);expect(s.meters.every(m=>m.property_id==='p')).toBe(true);expect(db.rpc).toHaveBeenCalledWith('landlord_meter_ids');
 });
 it('reads beyond provider page limits without silent truncation',async()=>{const range=vi.fn(async(start:number)=>({data:start===0?Array.from({length:500},(_,id)=>({id})): [{id:500}]}));expect(await readAll(()=>({range}))).toHaveLength(501);expect(range).toHaveBeenCalledTimes(2);});
});
