// SQL transaction regression against all real migrations. This does not execute the HTTP/C# layer.
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite(),dir=new URL('../database/migrations/',import.meta.url);
const source=await readFile(new URL('../backend/Endpoints/Sales.cs',import.meta.url),'utf8');
const quick=source.slice(source.indexOf('app.MapPost("/api/orders/{id:guid}/complete"'),source.indexOf('app.MapPost("/api/orders/{id:guid}/payment"'));
const queries=[...quick.matchAll(/(?:QuerySingleOrDefaultAsync|ExecuteScalarAsync<int>|ExecuteAsync)\("([^"]+)"/g)].map(m=>m[1]);
const sync=source.slice(source.indexOf('static async Task SyncCommission'),source.indexOf('static async Task Event'));
const commissionQueries=[...sync.matchAll(/ExecuteAsync\("([^"]+)"/g)].map(m=>m[1]);
async function run(tx,q,args){const names=[];q=q.replace(/@(\w+)/g,(_,n)=>{if(!names.includes(n))names.push(n);return '$'+(names.indexOf(n)+1);});return (await tx.query(q,names.map(n=>args[n]))).rows;}
const manager='00000000-0000-4000-8000-000000000001',ctv='00000000-0000-4000-8000-000000000002',customer='00000000-0000-4000-8000-000000000003',product='00000000-0000-4000-8000-000000000004';
await db.exec(await readFile(new URL('001_initial.sql',dir),'utf8'));
await db.query("INSERT INTO users(id,email,name,password_hash,role) VALUES($1,'manager@test','Manager','x','manager'),($2,'ctv@test','CTV','x','ctv')",[manager,ctv]);
await db.query("INSERT INTO customers(id,owner_id,name) VALUES($1,$2,'Test')",[customer,ctv]);
await db.query("INSERT INTO products(id,sku,name) VALUES($1,'TEST','Test')",[product]);
const ids=[];
for(let i=0;i<5;i++){
 const id=crypto.randomUUID();ids.push(id);const paid=[400000,0,1699000,0,0][i];
 await db.query("INSERT INTO orders(id,code,owner_id,customer_id,customer_snapshot,channel,subtotal,shipping,paid,commission_total,status) VALUES($1,$2,$3,$4,'{}','retail',1674000,25000,$5,$6,$7)",[id,'DH-'+i,i===3?manager:ctv,customer,paid,i===3?0:167400,i===4?'cancelled':'pending']);
 await db.query("INSERT INTO order_lines(id,order_id,product_id,sku,product_name,unit,qty,unit_price,commission_rate,amount,commission) VALUES($1,$2,$3,'TEST','Test','lọ',1,1674000,10,1674000,167400)",[crypto.randomUUID(),id,product]);
}
for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.startsWith('001')).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
let checks=0;
async function complete(id,version=1){return db.transaction(async tx=>{
 const o=(await run(tx,queries[0],{id}))[0];
 if(o.status==='completed'&&Number(o.paid)===Number(o.subtotal)+Number(o.shipping))return;
 assert.equal(o.version,version);assert(['pending','confirmed','shipping','completed'].includes(o.status));
 const total=Number(o.subtotal)+Number(o.shipping),delta=total-Number(o.paid);
 if(delta>0)await run(tx,queries.find(q=>q.startsWith('INSERT INTO payments')),{pid:crypto.randomUUID(),id,actor:manager,delta,reference:'Hoàn tất & thu đủ đơn '+o.code});
 await run(tx,queries.find(q=>q.startsWith('UPDATE orders')),{id,total});
 for(const q of commissionQueries)await run(tx,q,{id,cid:crypto.randomUUID()});
});}
for(let i=0;i<4;i++){
 await complete(ids[i]);await complete(ids[i]); // retry creates no duplicate receipt
 const r=(await db.query("SELECT o.status,o.paid,(SELECT sum(amount) FROM payments WHERE order_id=o.id) AS ledger,(SELECT count(*) FROM payments WHERE order_id=o.id AND NOT opening_balance) AS receipts,(SELECT count(*) FROM commissions WHERE order_id=o.id) AS commissions FROM orders o WHERE id=$1",[ids[i]])).rows[0];
 assert.equal(r.status,'completed');assert.equal(Number(r.paid),1699000);assert.equal(Number(r.ledger),1699000);assert.equal(Number(r.receipts),i===2?0:1);assert.equal(Number(r.commissions),i===3?0:1);checks+=5;
}
await assert.rejects(complete(ids[4]));checks++;
assert.equal((await db.query('SELECT status FROM orders WHERE id=$1',[ids[4]])).rows[0].status,'cancelled');checks++;
console.log(`PASS ${checks} SQL transaction assertions on migrations 001–008: partial/zero/full receipts, retry, CTV commission, manager exclusion, cancelled order rollback, ledger triggers.`);
await db.close();
