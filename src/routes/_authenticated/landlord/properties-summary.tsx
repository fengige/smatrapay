import { createFileRoute } from '@tanstack/react-router';
import { LandlordReportingPage } from '@/components/LandlordReportingPage';
import { checkRoleAccess } from '@/lib/auth.functions';
export const Route=createFileRoute('/_authenticated/landlord/properties-summary')({
 head:()=>({meta:[{title:'All Properties Summary Report · SmatraPay Landlord'},{name:'description',content:'All Properties Summary Report for your authorized properties and meters in SmatraPay.'},{property:'og:title',content:'All Properties Summary Report · SmatraPay Landlord'},{property:'og:description',content:'View real landlord-scoped all properties summary report across your linked properties.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
 loader:()=>checkRoleAccess({data:{role:'landlord'}}),
 component:()=> <LandlordReportingPage kind="summary"/>,
});
