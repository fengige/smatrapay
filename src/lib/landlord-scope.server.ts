export async function readAll(build:()=>any){const rows:any[]=[];for(let start=0;;start+=500){const {data,error}=await build().range(start,start+499);if(error)throw new Error(error.message);rows.push(...(data??[]));if(!data||data.length<500)return rows;}}
export async function landlordScope(context:{supabase:any;userId:string}){
 const {data:role,error}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'landlord'});if(error||!role)throw new Error('Landlord access required');
 return readLandlordScope(context.supabase);
}

async function readLandlordScope(db:any){
 const [{data:pids,error:pe},{data:uids,error:ue},{data:mids,error:me},{data:vendors,error:ve}]=await Promise.all([db.rpc('landlord_property_ids'),db.rpc('landlord_unit_ids'),db.rpc('landlord_meter_ids'),db.rpc('landlord_managing_vendors')]);
 if(pe||ue||me||ve)throw new Error('Could not load landlord scope');
 const ids=(a:any[])=>a?.length?a:['00000000-0000-0000-0000-000000000000'];
 const [properties,units,meters]=await Promise.all([
 readAll(()=>db.from('properties').select('id,name,code,city,address_line1,created_by').in('id',ids(pids)).order('id')),
 readAll(()=>db.from('units').select('id,property_id,unit_number,building,floor,status,electricity_meter_no,water_meter_no,gas_meter_no').in('id',ids(uids)).order('id')),
 readAll(()=>db.from('meters').select('id,meter_number,type,unit_id,vendor_id,status').in('id',ids(mids)).order('id'))]);
 const names=new Map((vendors??[]).map((v:any)=>[v.id,v.name]));
 const enriched=meters.map(m=>{const candidates=m.unit_id?units.filter(u=>u.id===m.unit_id):units.filter(u=>[u.electricity_meter_no,u.water_meter_no,u.gas_meter_no].includes(m.meter_number));const unit=candidates.length===1?candidates[0]:null;const property=properties.find(p=>p.id===unit?.property_id);return {...m,unit_name:unit?.unit_number??'Unlinked unit',property_id:property?.id??null,property_name:property?.name??'Unlinked property',vendor_name:names.get(m.vendor_id)??null};});
 return {properties:properties.map(p=>({...p,vendor_name:names.get(p.created_by)??null})),units,meters:enriched};
}
