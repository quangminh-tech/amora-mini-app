// Mocked browser integration test. No production data or credentials.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {mkdtemp} from 'node:fs/promises';
const root=fileURLToPath(new URL('../',import.meta.url));
const dist=path.join(root,'frontend/dist');
const temporary=await mkdtemp(path.join(tmpdir(),'amora-gallery-test-'));
const server=http.createServer(async(req,res)=>{try{const f=path.join(dist,new URL(req.url,'http://x').pathname);const bytes=await readFile(f.endsWith('/')?f+'index.html':f);res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; connect-src 'self' https:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.png')?'image/png':'text/html');res.end(bytes);}catch{res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
import {chromium} from '../frontend/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1050}});
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});
let doc;let published;let role='manager';let assetIds=[];const aid='00000000-0000-4000-8000-000000000004';const png=await readFile(dist+'/brand/amora-logo.png');
const uid='00000000-0000-4000-8000-000000000001',pid='00000000-0000-4000-8000-000000000002',did='00000000-0000-4000-8000-000000000003';
await page.addInitScript(()=>sessionStorage.setItem('amora-token','test'));
await page.route('**/api/**',async route=>{const req=route.request(),u=new URL(req.url()),path=u.pathname,method=req.method();const ok=d=>route.fulfill({json:d});
 if(path==='/api/auth/me')return ok({id:uid,name:'Kiểm thử',email:'test@example.test',role,mustChangePassword:false});
 if(path.startsWith('/api/admin/users'))return ok([]);
 if(path.startsWith('/api/overview'))return ok({quotes:{created:0,draft:0,sent:0,accepted:0,rejected:0},live:{waiting:0,expired:0},orders:{revenue:0,completed:0,processing:0},commissions:{pending:0,approved:0,paid:0},recent:[],team:[],missingPrices:0,activeCtvs:5});
 if(path==='/api/studio'&&method==='GET')return ok({items:doc?[{id:did,name:doc.name,editable:true,published_at:published?'2026-10-20':null,updated_at:'2026-10-20'}]:[],total:doc?1:0,page:1});
 if(path==='/api/studio'&&method==='POST'){const b=req.postDataJSON();doc={id:did,name:b.name,version:1,editable:true,published:false,content:{title:b.name,subtitle:'Simple Moments. Deep Calm.',intro:'',contact:'CÔNG TY TNHH AMORA STUDIO',note:'Điều kiện xác nhận khi đặt hàng.',theme:'cream',motion:true,showPrices:false,coverId:null,sections:[]}};return ok({id:did});}
 if(path===`/api/studio/${did}`&&method==='GET')return ok(u.searchParams.has('published')?{...doc,content:published}:doc);
 if(path===`/api/studio/${did}`&&method==='PUT'){const b=req.postDataJSON();assert.equal(b.version,doc.version);doc={...doc,...b,version:doc.version+1};return ok({version:doc.version});}
 if(path===`/api/studio/${did}/publish`){published=structuredClone(doc.content);doc.version++;doc.published=true;doc.publicSlug='a'.repeat(64);return ok({version:doc.version,publicSlug:doc.publicSlug});}
 if(path==='/api/products')return ok({products:[{id:pid,name:'Nến Sandalwood 220g',sku:'NT-TEST-220',size_label:'220g',color_label:'Đen'}],images:[],prices:[],total:1});
 if(path==='/api/catalogue/export-data')return ok({products:[{id:pid,name:'Sandalwood',model_name:'AMORA Sandalwood',sku:'NT-TEST-220',size_label:'220g',color_label:'Đen',description:'Hương gỗ ấm áp.',unit:'lọ',scent_name:'Sandalwood',top_notes:'Gỗ tuyết tùng',middle_notes:'Đàn hương',base_notes:'Xạ hương'}],prices:[{product_id:pid,unit_price:279000}]});
 if(path.endsWith('/assets')&&method==='POST'){assetIds.push(aid);return ok({id:aid});}
 if(path.endsWith('/assets'))return ok(assetIds.map(id=>({id,caption:'Ảnh thử'})));
 if(path.includes('/assets/'))return route.fulfill({contentType:'image/png',body:png});
 return ok({});
});
await page.goto(base);
await page.getByRole('button',{name:'Catalogue',exact:true}).click();
page.once('dialog',d=>d.accept('Bộ sưu tập thử'));
await page.getByRole('button',{name:'+ Tạo catalogue',exact:true}).click();
await page.getByLabel('Tiêu đề trên bìa').fill('Một khoảng yên cho bạn');
await page.getByRole('button',{name:'+ Chọn sản phẩm',exact:true}).click();
await page.getByRole('button',{name:'Chọn sản phẩm',exact:true}).click();

await page.getByLabel('Mô tả',{exact:false}).fill('Sandalwood — mô tả riêng catalogue.');
await page.getByRole('button',{name:'+ Ảnh từ thư viện / tải lên',exact:true}).click();
await page.getByLabel('Upload ảnh riêng').setInputFiles({name:'test.png',mimeType:'image/png',buffer:png});
await page.locator('.cs-sheet .cs-photo[data-state=ready]').waitFor();
assert.equal(await page.locator('.cs-sheet .cs-photo img').count(),1);
await page.getByRole('button',{name:'+ Bảng',exact:true}).click();
await page.getByRole('button',{name:'Điền từ sản phẩm đã chọn'}).click();
assert.equal(await page.locator('.cs-sheet tbody tr').count(),1);
assert.match(await page.locator('.cs-sheet').innerText(),/220g/);

await page.getByRole('button',{name:'+ Bộ ảnh',exact:true}).click();
assert.equal(await page.getByLabel('Bố cục',{exact:false}).inputValue(),'full');
await page.getByLabel('Số cột ảnh',{exact:false}).selectOption('3');
await page.getByLabel('Tỷ lệ khung ảnh',{exact:false}).selectOption('square');
await page.getByLabel('Khoảng cách ảnh:',{exact:false}).evaluate(el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'0');el.dispatchEvent(new Event('input',{bubbles:true}));});
await page.getByLabel('Bo góc ảnh:',{exact:false}).evaluate(el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'16');el.dispatchEvent(new Event('input',{bubbles:true}));});
await page.getByRole('button',{name:'+ Ảnh từ thư viện / tải lên',exact:true}).click();
await page.getByRole('button',{name:/Ảnh thử/}).click();
await page.locator('.cs-layout-full .cs-photo[data-state=ready]').waitFor();
await page.getByLabel('Ảnh 1: trái / phải',{exact:false}).evaluate(el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'15');el.dispatchEvent(new Event('input',{bubbles:true}));});
const dimensions=await page.locator('.cs-layout-full .cs-custom-grid').evaluate(el=>{const section=el.closest('.cs-section');return {grid:el.getBoundingClientRect().width,section:section.getBoundingClientRect().width,columns:getComputedStyle(el).gridTemplateColumns,gap:getComputedStyle(el).gap};});
assert(Math.abs(dimensions.grid-dimensions.section)<1,'Gallery must fill section width');assert.equal(dimensions.gap,'0px');assert.equal(dimensions.columns.split(' ').length,3);
assert.equal(await page.locator('.cs-layout-full .cs-copy').count(),0,'Empty caption must not reserve a second column');
assert.equal(await page.locator('.cs-layout-full .cs-photo').evaluate(el=>getComputedStyle(el).borderRadius),'16px');
assert.equal(await page.locator('.cs-layout-full .cs-photo img').evaluate(el=>el.style.objectPosition),'15% 50%');
await page.getByRole('button',{name:'Lưu',exact:true}).click();
await page.getByText('Đã lưu catalogue.',{exact:false}).waitFor();
assert.equal(doc.content.sections.length,3);
await page.getByRole('button',{name:'Phát hành & tạo link'}).click();
await page.getByText('Đã phát hành và tạo link landing page cho khách.',{exact:false}).waitFor();
assert.match(await page.getByLabel('Link landing page').inputValue(),/catalogue=a{64}$/);
assert.equal(doc.content.sections[0].topNotes,'Gỗ tuyết tùng');
await page.getByLabel('Tiêu đề trên bìa').fill('Bản nháp đã thay đổi');
assert.equal(published.title,'Một khoảng yên cho bạn');
// Navigation guard must keep dirty content when cancelled.
page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Bảng giá',exact:true}).click();
assert.equal(await page.getByLabel('Tiêu đề trên bìa').inputValue(),'Bản nháp đã thay đổi');
await page.getByRole('button',{name:'Xem trước',exact:true}).click();
await page.getByRole('button',{name:'Xem điện thoại',exact:true}).click();
await page.getByRole('button',{name:'In / Lưu PDF',exact:true}).click();
await page.locator('#cs-print-frame').waitFor({state:'attached'});
await page.waitForTimeout(300);
assert.match(await page.frameLocator('#cs-print-frame').locator('body').innerText(),/220g/);
// In print all content remains visible and table rows survive.
await page.emulateMedia({media:'print'});assert.equal(await page.locator('.cs-sheet tbody tr').count(),1);assert(Math.abs(await page.locator('.cs-layout-full .cs-photos').evaluate(el=>el.getBoundingClientRect().width-el.closest('.cs-section').getBoundingClientRect().width))<1);await page.emulateMedia({media:'screen'});
await page.evaluate(()=>{const sheet=document.querySelector('.cs-sheet').cloneNode(true);sheet.id='qa-print';sheet.classList.remove('cs-motion');sheet.querySelectorAll('.cs-edit-only').forEach(x=>x.remove());document.body.append(sheet);const style=document.createElement('style');style.id='qa-print-style';style.textContent='@media print{body > *:not(#qa-print){display:none!important}} @media screen{#qa-print{display:none}}';document.head.append(style);});
await page.emulateMedia({media:'print'});
await page.pdf({path:path.join(temporary,'print-check.pdf'),format:'A4',printBackground:true});
await page.emulateMedia({media:'screen'});
await page.evaluate(()=>{document.getElementById('qa-print').remove();document.getElementById('qa-print-style').remove();});
assert.deepEqual(errors,[]);
await page.setViewportSize({width:390,height:844});
console.log('PASS full gallery: width, three columns, gap, radius, independent crop and no empty caption; manager: menu, create, product snapshot, image upload/render, print iframe, custom text, generated table, save, publish snapshot, dirty navigation guard, mobile, print CSS.');
// CTV must not see manual pricing or publication controls.
role='ctv';await page.setViewportSize({width:1440,height:1050});await page.reload();await page.getByRole('button',{name:'Catalogue',exact:true}).click();await page.getByRole('button',{name:'Mở / chỉnh sửa',exact:true}).click();
assert.equal(await page.getByRole('button',{name:'Phát hành & tạo link'}).count(),0);
assert.equal(await page.getByLabel('Hiện giá lẻ tham khảo').count(),0);
console.log('PASS CTV controls; no runtime errors.');
await browser.close();server.close();
