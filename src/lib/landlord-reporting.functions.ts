import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { landlordFilterSchema,groupLandlordRows,landlordTotals,type LandlordRow } from './landlord-reporting';
import { landlordScope,readAll } from './landlord-scope.server';
export const getLandlordProperties=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>landlordScope(context));
export const getLandlordPropertyDetail=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({propertyId:z.string().uuid()}).parse(d)).handler(async({data,context})=>{
 const scope=await landlordScope(context);
 const scoped=scope.properties.find(p=>p.id===data.propertyId);
 if(!scoped)throw new Error('Property not available');

 // Privileged reads below are only reached after the landlord scope check passed.
 const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');

 const {data:property,error:pErr}=await admin.from('properties').select('*').eq('id',data.propertyId).maybeSingle();
 if(pErr)throw new Error(pErr.message);
 if(!property)throw new Error('Property not available');

 const zoneId=(property as any).zone_id as number|null;
 const {data:zone}=zoneId!=null
  ?await admin.from('zones').select('zone_id, zone_name').eq('zone_id',zoneId).maybeSingle()
  :{data:null as any};

 const ownerId=(property as any).landlord_id as string|null;
 const {data:owner}=ownerId
  ?await admin.from('users').select('id, name, email, phone, status, profile_image, address').eq('id',ownerId).maybeSingle()
  :{data:null as any};

 let ownerStats={property_count:0,unit_count:0};
 if(ownerId){
  const {data:ownerProps}=await admin.from('properties').select('id').eq('landlord_id',ownerId);
  const ownerPropIds=((ownerProps??[]) as any[]).map(p=>p.id);
  const {data:ownerUnits}=ownerPropIds.length
   ?await admin.from('units').select('id').in('property_id',ownerPropIds)
   :{data:[] as any[]};
  ownerStats={property_count:ownerPropIds.length,unit_count:((ownerUnits??[]) as any[]).length};
 }

 const {data:unitRows}=await admin.from('units').select('*').eq('property_id',data.propertyId).order('unit_number');
 const units=(unitRows??[]) as any[];
 const unitIds=units.map(u=>u.id as string);

 const {data:assignmentRows}=unitIds.length
  ?await admin.from('unit_assignments').select('id, unit_id, user_id, role, start_date, end_date').in('unit_id',unitIds).order('start_date',{ascending:false})
  :{data:[] as any[]};
 const assignments=(assignmentRows??[]) as any[];

 const personIds=[...new Set(assignments.map(a=>a.user_id))];
 const {data:people}=personIds.length
  ?await admin.from('users').select('id, name, email, phone, status, profile_image').in('id',personIds)
  :{data:[] as any[]};
 const peopleMap=new Map(((people??[]) as any[]).map(p=>[p.id,p]));

 const {data:meterRows}=unitIds.length
  ?await admin.from('meters').select('id, meter_number, serial_number, type, status, installation_status, unit_id').in('unit_id',unitIds)
  :{data:[] as any[]};
 const meters=(meterRows??[]) as any[];

 const {data:photoRows}=await admin.from('property_photos').select('id, storage_path, caption, category, is_primary, uploaded_by, created_at').eq('property_id',data.propertyId).order('created_at',{ascending:false});
 const photos=(photoRows??[]) as any[];

 const uploaderIds=[...new Set(photos.map(p=>p.uploaded_by).filter(Boolean))];
 const {data:uploaders}=uploaderIds.length
  ?await admin.from('users').select('id, name, email').in('id',uploaderIds)
  :{data:[] as any[]};
 const uploaderMap=new Map(((uploaders??[]) as any[]).map(u=>[u.id,u.name??u.email]));

 const signedPhotos=await Promise.all(photos.map(async p=>{
  const {data:signed}=await admin.storage.from('property-photos').createSignedUrl(p.storage_path as string,600);
  return {
   id:p.id as string,
   url:(signed?.signedUrl??null) as string|null,
   caption:(p.caption??null) as string|null,
   is_primary:Boolean(p.is_primary),
   uploaded_by:(p.uploaded_by?(uploaderMap.get(p.uploaded_by)??'Unknown'):'Unknown') as string,
   created_at:p.created_at as string,
  };
 }));

 const [{data:propLogs},{data:addressLogs},{data:unitLogs},{data:assignLogs}]=await Promise.all([
  admin.from('property_audit_logs').select('id, action, changes, actor_id, created_at').eq('property_id',data.propertyId).order('created_at',{ascending:false}).limit(200),
  admin.from('address_audit_logs').select('id, action, changes, actor_id, created_at').eq('property_id',data.propertyId).order('created_at',{ascending:false}).limit(200),
  unitIds.length
   ?admin.from('unit_audit_logs').select('id, unit_id, action, changes, actor_id, created_at').in('unit_id',unitIds).order('created_at',{ascending:false}).limit(300)
   :Promise.resolve({data:[] as any[]}),
  unitIds.length
   ?admin.from('assignment_audit_logs').select('id, action, changes, actor_id, created_at, new_unit_id, old_unit_id, user_id').order('created_at',{ascending:false}).limit(300)
   :Promise.resolve({data:[] as any[]}),
 ]);

 const unitLabel=new Map(units.map(u=>[u.id as string,u.unit_number as string]));
 const actorIds=[...new Set([...((propLogs??[]) as any[]),...((addressLogs??[]) as any[]),...((unitLogs??[]) as any[]),...((assignLogs??[]) as any[])].map(l=>l.actor_id).filter(Boolean))];
 const {data:actors}=actorIds.length
  ?await admin.from('users').select('id, name, email').in('id',actorIds)
  :{data:[] as any[]};
 const actorMap=new Map(((actors??[]) as any[]).map(a=>[a.id,a.name??a.email]));
 const actorName=(id:string|null)=>(id?(actorMap.get(id)??'Unknown'):'System');

 const describe=(changes:any)=>{
  if(!changes||typeof changes!=='object')return{previous:null,next:null};
  const entries=Object.entries(changes as Record<string,any>).filter(([,v])=>v&&typeof v==='object'&&('old'in v||'new'in v));
  if(!entries.length)return{previous:null,next:null};
  return{
   previous:entries.map(([k,v])=>`${k}: ${v.old??'—'}`).join('; ')||null,
   next:entries.map(([k,v])=>`${k}: ${v.new??'—'}`).join('; ')||null,
  };
 };

 const timeline=[
  ...((propLogs??[]) as any[]).map(l=>({id:`prop-${l.id}`,event:l.action as string,unit:null as string|null,...describe(l.changes),actor:actorName(l.actor_id),created_at:l.created_at as string})),
  ...((addressLogs??[]) as any[]).map(l=>({id:`addr-${l.id}`,event:`address_${l.action}`,unit:null as string|null,...describe(l.changes),actor:actorName(l.actor_id),created_at:l.created_at as string})),
  ...((unitLogs??[]) as any[]).map(l=>({id:`unit-${l.id}`,event:`unit_${l.action}`,unit:(unitLabel.get(l.unit_id)??null) as string|null,...describe(l.changes),actor:actorName(l.actor_id),created_at:l.created_at as string})),
  ...((assignLogs??[]) as any[])
   .filter(l=>(l.new_unit_id&&unitLabel.has(l.new_unit_id))||(l.old_unit_id&&unitLabel.has(l.old_unit_id)))
   .map(l=>({
    id:`assign-${l.id}`,
    event:`assignment_${l.action}`,
    unit:(unitLabel.get(l.new_unit_id??l.old_unit_id)??null) as string|null,
    previous:(l.old_unit_id?(unitLabel.get(l.old_unit_id)??null):null) as string|null,
    next:(l.new_unit_id?(unitLabel.get(l.new_unit_id)??null):null) as string|null,
    actor:actorName(l.actor_id),
    created_at:l.created_at as string,
   })),
 ].sort((a,b)=>(a.created_at<b.created_at?1:-1));

 const occupied=units.filter(u=>u.status==='occupied').length;

 return {
  property:{
   ...(property as any),
   zone_name:((zone as any)?.zone_name??null) as string|null,
   vendor_name:scoped.vendor_name,
   unit_count:units.length,
   occupied_units:occupied,
   available_units:units.length-occupied,
   photo_url:signedPhotos.find(p=>p.is_primary)?.url??signedPhotos[0]?.url??null,
  },
  owner:owner?{...(owner as any),...ownerStats,owner_type:((property as any).owner_type??'landlord') as string}:null,
  units:units.map(u=>{
   const current=assignments.find(a=>a.unit_id===u.id&&!a.end_date&&a.role==='resident');
   const unitOwner=assignments.find(a=>a.unit_id===u.id&&!a.end_date&&a.role==='landlord');
   return{
    id:u.id as string,
    unit_number:u.unit_number as string,
    unit_type:(u.unit_type??null) as string|null,
    floor:(u.floor??null) as string|null,
    building:(u.building??null) as string|null,
    status:(u.status??'vacant') as string,
    resident_name:(current?(peopleMap.get(current.user_id)?.name??null):null) as string|null,
    owner_name:(unitOwner?(peopleMap.get(unitOwner.user_id)?.name??null):null) as string|null,
    meters:meters.filter(m=>m.unit_id===u.id).map(m=>({
     id:m.id as string,
     meter_number:m.meter_number as string,
     type:m.type as string,
     status:m.status as string,
     installation_status:(m.installation_status??'not_installed') as string,
    })),
    created_at:u.created_at as string,
   };
  }),
  residents:assignments.filter(a=>a.role==='resident').map(a=>{
   const person=peopleMap.get(a.user_id);
   return{
    assignment_id:a.id as string,
    id:a.user_id as string,
    name:(person?.name??null) as string|null,
    email:(person?.email??null) as string|null,
    phone:(person?.phone??null) as string|null,
    status:(person?.status??'active') as string,
    unit_number:(unitLabel.get(a.unit_id)??null) as string|null,
    start_date:(a.start_date??null) as string|null,
    current:!a.end_date,
   };
  }),
  photos:signedPhotos,
  timeline,
 };
});
async function dataset(context:any,input:ReturnType<typeof landlordFilterSchema.parse>){
 const scope=await landlordScope(context);
 if(input.property&&!scope.properties.some(p=>p.id===input.property))throw new Error('Property not available');
 const meters=scope.meters.filter(m=>(input.kind!=='summary'||m.property_id)&&(!input.property||m.property_id===input.property)&&(!input.type||m.type===input.type));
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
