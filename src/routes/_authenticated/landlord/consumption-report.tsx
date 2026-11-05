import { createFileRoute } from '@tanstack/react-router';
import { LandlordReportingPage } from '@/components/LandlordReportingPage';
import { checkRoleAccess } from '@/lib/auth.functions';
export const Route=createFileRoute('/_authenticated/landlord/consumption-report')({
 head:()=>({meta:[{title:'Consumption Report · SmatraPay Landlord'},{name:'description',content:'Consumption Report for your authorized properties and meters in SmatraPay.'},{property:'og:title',content:'Consumption Report · SmatraPay Landlord'},{property:'og:description',content:'View real landlord-scoped consumption report across your linked properties.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
 loader:async()=>{const access=await checkRoleAccess({data:{role:'landlord'}});if(!access.allowed)throw new Error('Landlord access required');return access;},
 errorComponent:()=> <p role="alert" className="p-8">Landlord access is required to view this page.</p>,
 component:()=> <LandlordReportingPage kind="consumption"/>,
});
