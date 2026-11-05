import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { landlordFilterSchema,groupLandlordRows,landlordTotals,type LandlordRow } from './landlord-reporting';
import { landlordScope,readAll } from './landlord-scope.server';
export const getLandlordProperties=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>landlordScope(context));
async function dataset(context:any,input:ReturnType<typeof landlordFilterSchema.parse>){
 const scope=await landlordScope(context);
 if(input.property&&!scope.properties.some(p=>p.id===input.property))throw new Error('Property not available');
 const meters=scope.meters.filter(m=>(!input.property||m.property_id===input.property)&&(!input.type||m.type===input.type));
 const byId=new Map(meters.map(m=>[m.id,m]));
 const ids=meters.length?meters.map(m=>m.id):['00000000-0000-0000-0000-000000000000'];
 const build=()=>{let q=context.supabase.from('transaction_records').select('record_id,token_id,meter_id,meter_number,trans_id,txn_at,amount_paid,tokenizable_amount,commission_amount,vat_on_commission_amount,units,token_status,payment_status,token,bank,vending_software,error_message,action').in('meter_id',ids).eq('action','credit').gte('txn_at',`${input.from}T00:00:00+03:00`).lte('txn_at',`${input.to}T23:59:59.999+03:00`);
 if(input.kind==='recent')q=q.eq('token_status','generated');
 const term=input.q.replace(/[^\p{L}\p{N}\s._-]/gu,' ').trim();if(term)q=q.or(`meter_number.ilike.%${term}%,trans_id.ilike.%${term}%,bank.ilike.%${term}%`);return q.order('txn_at',{ascending:false}).order('record_id');};
 const raw=await readAll(build);const seen=new Set<string>();
 const rows:LandlordRow[]=raw.filter(r=>{const key=r.token_id??r.record_id;if(seen.has(key))return false;seen.add(key);return true;}).map(r=>{const m=byId.get(r.meter_id);return {...r,property_id:m?.property_id??null,property_name:m?.property_name??'Unlinked property',unit_name:m?.unit_name??'Unlinked unit',meter_type:m?.type??'',quantity_label:m?.type==='Electricity'?'kWh':'',amount_paid:r.amount_paid==null?null:Number(r.amount_paid),tokenizable_amount:r.tokenizable_amount==null?null:Number(r.tokenizable_amount),commission_amount:r.commission_amount==null?null:Number(r.commission_amount),vat_on_commission_amount:r.vat_on_commission_amount==null?null:Number(r.vat_on_commission_amount),units:r.units==null?null:Number(r.units)};});
 const grouped=input.kind==='summary'||input.kind==='consumption'?groupLandlordRows(rows,input.kind,input.kind==='summary'?scope.properties:[]):rows;
 return {rows:grouped,total:grouped.length,totals:landlordTotals(rows),properties:scope.properties,unknownTokenAmounts:rows.filter(r=>r.tokenizable_amount==null).length};
}
export const readLandlordReport=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>landlordFilterSchema.parse(d)).handler(async({data,context})=>{const result=await dataset(context,data);const pages=Math.max(1,Math.ceil(result.total/data.pageSize));const page=Math.min(data.page,pages);return {...result,rows:result.rows.slice((page-1)*data.pageSize,page*data.pageSize),page,pages};});
export const exportLandlordReport=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>landlordFilterSchema.parse(d)).handler(async({data,context})=>{const result=await dataset(context,data);return {...result,rows:result.rows.map(r=>({...r,token:null}))};});
