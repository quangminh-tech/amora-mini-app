// No browser/third-party PDF service. Exercises the exact frontend PDF function.
// Run after npm ci in frontend: node tests/pdf-smoke.mjs
import {build} from '../frontend/node_modules/esbuild/lib/main.js';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const scratch=await mkdtemp(join(tmpdir(),'amora-pdf-'));const outfile=join(scratch,'pdf.mjs');
await build({entryPoints:[join(root,'frontend/src/pdf.ts')],bundle:true,platform:'node',format:'esm',outfile,define:{'import.meta.env':'{}'},logLevel:'warning'});
let blob,saved;
globalThis.fetch=async()=>new Response(await readFile(join(root,'frontend/public/fonts/DejaVuSans.ttf')));
URL.createObjectURL=(b)=>{blob=b;return 'blob:pdf-test';};URL.revokeObjectURL=()=>{};
globalThis.document={createElement(){return {click(){saved=true;}};}};
const {exportQuote}=await import(pathToFileURL(outfile));
const lines=Array.from({length:60},(_,i)=>({product_name:`${i+1}. Nến thơm Lucente nel Buio — Ánh sáng trong màn đêm`,sku:'AM-01',unit:'lọ',qty:20,unit_price:350000,amount:7000000}));
await exportQuote({code:'BG-KIEM-TRA',created_at:'2026-10-16T09:00:00Z',valid_until:'2026-10-30',subtotal:420000000,shipping:25000,note:'Bản kiểm tra kỹ thuật, không phải báo giá thương mại.',terms:'Thời gian thực hiện dự kiến 7–10 ngày. Giá và điều kiện phải được quản lý xác nhận.\nChưa phải hóa đơn thuế.',seller_snapshot:{name:'AMORA STUDIO',tagline:'Simple Moments. Deep Calm.',phone:'',email:'',address:'TP. Hồ Chí Minh',bank:'Thông tin thanh toán thử nghiệm'},customer_snapshot:{name:'Chị Nguyễn Ánh — Bộ phận Hành chính',company:'Công ty thử nghiệm tiếng Việt',phone:'0900000000',address:'Thành phố Hồ Chí Minh'}},lines);
assert(saved&&blob,'PDF download must be triggered');
const bytes=new Uint8Array(await blob.arrayBuffer());assert.equal(new TextDecoder().decode(bytes.slice(0,5)),'%PDF-');
const output=join(scratch,'quote-smoke.pdf');await writeFile(output,bytes);console.log('PASS: PDF with 60 Vietnamese product lines:',output);
