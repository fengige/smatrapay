import { createFileRoute } from '@tanstack/react-router';
import { LandlordPropertiesPage } from '@/components/LandlordPropertiesPage';
import { checkRoleAccess } from '@/lib/auth.functions';
export const Route=createFileRoute('/_authenticated/landlord/properties')({
 head:()=>({meta:[{title:'My Properties · SmatraPay Landlord'},{name:'description',content:'My Properties for your authorized properties and meters in SmatraPay.'},{property:'og:title',content:'My Properties · SmatraPay Landlord'},{property:'og:description',content:'View real landlord-scoped my properties across your linked properties.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
 loader:async()=>{const access=await checkRoleAccess({data:{role:'landlord'}});if(!access.allowed)throw new Error('Landlord access required');return access;},
 errorComponent:()=> <p role="alert" className="p-8">Landlord access is required to view this page.</p>,
 component:()=> <LandlordPropertiesPage />,
});
