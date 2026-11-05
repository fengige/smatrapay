import {it,expect} from 'vitest';
import {reportBlob} from '@/components/landlord-report-export';
it('produces valid PDF and Excel report files from the same rows',async()=>{
 const pdf=await reportBlob([],'summary','All Properties Summary Report','2026-11', 'pdf');expect(pdf.size).toBeGreaterThan(500);expect((await pdf.text()).slice(0,5)).toBe('%PDF-');
 const excel=await reportBlob([],'summary','All Properties Summary Report','2026-11','xlsx');expect(excel.size).toBeGreaterThan(500);const bytes=new Uint8Array(await excel.arrayBuffer());expect([...bytes.slice(0,2)]).toEqual([80,75]);
});
