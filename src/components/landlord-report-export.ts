import type { LandlordRow } from '@/lib/landlord-reporting';
// Token Amount, Commission and Tax are intentionally hidden from landlords.
export function reportColumns(kind:string){return [...(kind==='summary'?[['property_name','Property Name']]:[['unit_name','Unit Name'],['meter_number','Meter No.'],...(kind==='consumption'?[]:[['trans_id','TransID']])]),['amount_paid','Amount Paid'],...(kind==='consumption'?[['units','Vended Quantity'],['quantity_label','Quantity Unit']]:[])] as [keyof LandlordRow,string][];}
export async function reportBlob(rows:LandlordRow[],kind:string,title:string,period:string,format:'pdf'|'xlsx'){
 const cols=reportColumns(kind);const value=(r:LandlordRow,k:keyof LandlordRow)=>k==='units'&&(!r.quantity_label||r.quantity_unavailable)?'Unavailable':r[k]??'—';
 if(format==='xlsx'){const {default:write}=await import('write-excel-file/browser');return await write([cols.map(c=>({value:c[1],fontWeight:'bold' as const})),...rows.map(r=>cols.map(([k])=>{const v=value(r,k);return typeof v==='number'?{value:v,type:Number}:{value:String(v),type:String};}))] as never).toBlob();}
 const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);const doc=new jsPDF({orientation:'landscape'});doc.setFontSize(14);doc.text(title,14,14);doc.setFontSize(9);doc.text(period,14,21);autoTable(doc,{startY:26,head:[cols.map(c=>c[1])],body:rows.map(r=>cols.map(([k])=>String(value(r,k)))),styles:{fontSize:8}});return doc.output('blob');
}
export function downloadReport(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
