import { createFileRoute } from '@tanstack/react-router';
import { LandlordReportingPage } from '@/components/LandlordReportingPage';
import { checkRoleAccess } from '@/lib/auth.functions';
export const Route=createFileRoute('/_authenticated/landlord/vending-records')({
 head:()=>({meta:[{title:'Vending Records · SmatraPay Landlord'},{name:'description',content:'Vending Records for your authorized properties and meters in SmatraPay.'},{property:'og:title',content:'Vending Records · SmatraPay Landlord'},{property:'og:description',content:'View real landlord-scoped vending records across your linked properties.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
 loader:async()=>{const access=await checkRoleAccess({data:{role:'landlord'}});if(!access.allowed)throw new Error('Landlord access required');return access;},
 errorComponent:()=> <p role="alert" className="p-8">Landlord access is required to view this page.</p>,
 component:()=> <LandlordReportingPage kind="vending"/>,
});
