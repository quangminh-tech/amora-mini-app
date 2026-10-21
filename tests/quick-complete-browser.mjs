// Mocked API browser regression; does not execute the .NET API.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '../frontend/node_modules/playwright/index.mjs');
const dist=fileURLToPath(new URL('../frontend/dist/',import.meta.url));
const server=http.createServer(async(req,res)=>{try{let p=new URL(req.url,'http://x').pathname;if(p==='/')p='/index.html';res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(await readFile(path.join(dist,p)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {})});
try {
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
let role='manager',calls=0,fail=false;
let record={id:'00000000-0000-4000-8000-000000000001',code:'DH-TEST',customer_name:'Khách thử',owner_name:'CTV thử',customer_snapshot:{name:'Khách thử'},channel:'retail',status:'pending',created_at:'2026-10-20T07:00:00Z',subtotal:1674000,shipping:25000,paid:400000,commission_total:167400,version:1,note:''};
await page.addInitScript(()=>sessionStorage.setItem('amora-token','fixture'));
await page.route('**/api/**',async route=>{const req=route.request(),p=new URL(req.url()).pathname;const ok=x=>route.fulfill({json:x});
if(p==='/api/auth/me')return ok({id:'u',name:'AMORA Test',role,mustChangePassword:false});
if(p==='/api/overview')return ok({quotes:{created:1,draft:0,sent:0,accepted:1,rejected:0},live:{waiting:0,expired:0},orders:{booked:1699000,created_count:1,revenue:record.status==='completed'?1674000:0,processing:1,completed:0},collected:record.paid,commissions:{pending:0,approved:0,paid:0},recent:[],team:[],activeCtvs:1,missingPrices:0});
if(p.endsWith('/complete')){calls++;assert.equal(req.method(),'POST');assert.equal(req.postDataJSON().version,1);if(fail)return route.fulfill({status:409,json:{message:'Đơn đã thay đổi. Vui lòng tải lại.'}});record={...record,status:'completed',paid:1699000,version:2};return route.fulfill({status:204});}
if(p==='/api/orders/'+record.id)return ok({record,lines:[],events:[],payments:[]});
if(p==='/api/orders')return ok({items:[record],total:1,page:1,pageSize:25});
if(p==='/api/settings')return ok({ctvQuotes:true});
if(p==='/api/pricing/policies')return ok({policies:[],tiers:[]});
if(p==='/api/document-templates')return ok({templates:[]});
if(p==='/api/customers')return ok({items:[],total:0});
if(p==='/api/products')return ok({products:[],prices:[],images:[],total:0});
return ok([]);});
await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByText('Giá trị đơn trong kỳ',{exact:true}).waitFor();assert.match(await page.locator('.metrics').innerText(),/1\.699\.000/);
await page.getByRole('button',{name:'Đơn hàng',exact:true}).click();await page.getByRole('button',{name:'Xem →',exact:true}).click();await page.getByRole('button',{name:'Hoàn tất & thu đủ',exact:true}).click();assert.equal(calls,0);assert.match(await page.locator('.inline-action').innerText(),/1\.299\.000/);
fail=true;await page.locator('.inline-action').getByRole('button',{name:'Xác nhận',exact:true}).click();await page.getByText('Đơn đã thay đổi. Vui lòng tải lại.',{exact:true}).first().waitFor();assert.equal(calls,1);
fail=false;await page.locator('.inline-action').getByRole('button',{name:'Xác nhận',exact:true}).click();await page.locator('.detail-heading').getByText('Hoàn tất',{exact:true}).waitFor();assert.equal(calls,2);assert.equal(await page.getByRole('button',{name:'Hoàn tất & thu đủ',exact:true}).count(),0);
await page.getByRole('button',{name:'Đóng',exact:true}).click();await page.getByRole('button',{name:'Tổng quan',exact:true}).click();assert.match(await page.locator('.metrics').innerText(),/1\.674\.000/);
role='ctv';await page.reload();await page.getByText('Giá trị đơn trong kỳ',{exact:true}).waitFor();assert.match(await page.locator('.ctv-stats').innerText(),/1\.699\.000/);
await page.getByRole('button',{name:'Đơn hàng',exact:true}).click();await page.getByRole('button',{name:'Xem →',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Hoàn tất & thu đủ',exact:true}).count(),0);assert.deepEqual(errors,[]);
console.log('PASS mocked browser: recorded value, balance confirmation, conflict, completion, dashboard refresh, CTV permission.');
} finally {await browser.close();server.close();}
