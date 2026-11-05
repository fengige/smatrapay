import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import postgres from 'postgres';
const connection=process.env['SUPABASE_DB_URL'];const sql=connection?postgres(connection,{max:1,prepare:false}):null;
describe.skipIf(!sql)('installed landlord scope and security',()=>{
 let predicate='';
 beforeAll(async()=>{if(!sql)return;const rows=await sql`select pg_get_functiondef('public.landlord_unit_ids()'::regprocedure) as definition`;const definition=String(rows[0]?.['definition']);const match=definition.match(/p.landlord_id=auth.uid\(\) AND coalesce\(p.owner_type,'landlord'\)='landlord'/);if(!match)throw new Error('Ownership rule missing');predicate=match[0].replaceAll('auth.uid()','$1::uuid');});
 afterAll(async()=>{await sql?.end();});
 async function owned(owner:string,type:string){if(!sql)throw new Error('Database connection required');const result=await sql.unsafe(`select (${predicate}) as allowed from (select $2::uuid as landlord_id,$3::text as owner_type) p`,['00000000-0000-0000-0000-000000000001',owner,type]);return result[0]?.['allowed'];}
 it('accepts landlord-owned property regardless of managing vendor',async()=>{expect(await owned('00000000-0000-0000-0000-000000000001','landlord')).toBe(true);});
 it('denies another landlords property',async()=>{expect(await owned('00000000-0000-0000-0000-000000000002','landlord')).toBe(false);});
 it('does not treat vendor ownership as landlord ownership',async()=>{expect(await owned('00000000-0000-0000-0000-000000000001','vendor')).toBe(false);});
 it('denies anonymous execution of every scope helper',async()=>{if(!sql)throw new Error('Database connection required');for(const name of ['landlord_unit_ids','landlord_meter_ids','landlord_property_ids','landlord_managing_vendors']){const result=await sql`select has_function_privilege('anon',${'public.'+name+'()'},'EXECUTE') as allowed`;expect(result[0]?.['allowed']).toBe(false);}});
 it('keeps unified transaction source from duplicating bank payments linked to tokens',async()=>{if(!sql)throw new Error('Database connection required');const rows=await sql`select pg_get_viewdef('public.transaction_records'::regclass,true) as definition`;expect(String(rows[0]?.['definition'])).toMatch(/WHERE b.token_id IS NULL/);});
});
