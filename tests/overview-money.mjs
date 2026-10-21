// Execute the actual overview SQL against an isolated PostgreSQL WASM database.
// npm install --no-save @electric-sql/pglite, then node tests/overview-money.mjs
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const source=await readFile(new URL('../backend/Endpoints/Overview.cs',import.meta.url),'utf8');
const scope='(@manager OR owner_id=@uid) AND (@owner IS NULL OR owner_id=@owner)';
const orderSql=source.match(/var orders=await c.QuerySingleAsync\("([^"]+)"\+scope/)[1]+scope;
const receiptSql=source.match(/var collected=await c.ExecuteScalarAsync<decimal>\("([^"]+)"/)[1];
const base={manager:true,uid:'a',owner:null,from:'2026-09-30T17:00:00Z',to:'2026-10-21T17:00:00Z'};
async function sql(query,args=base){const names=[];const q=query.replace(/@(\w+)/g,(_,n)=>{let i=names.indexOf(n);if(i<0){i=names.length;names.push(n);}return '$'+(i+1)+(n==='owner'?'::text':'');});return (await db.query(q,names.map(n=>args[n]))).rows;}
await db.exec(`CREATE TABLE orders(id text PRIMARY KEY,owner_id text,status text,subtotal numeric,shipping numeric,created_at timestamptz,completed_at timestamptz);
CREATE TABLE payments(order_id text,amount numeric,opening_balance boolean,occurred_at timestamptz);
INSERT INTO orders VALUES
('pending','a','pending',1674000,25000,'2026-10-20T07:00Z',NULL),
('done','a','completed',100000,10000,'2026-09-01T07:00Z','2026-10-01T07:00Z'),
('cancel','a','cancelled',999999,0,'2026-10-01T07:00Z',NULL),
('return','a','returned',999999,0,'2026-10-01T07:00Z','2026-10-02T07:00Z'),
('other','b','confirmed',200000,5000,'2026-10-21T16:59:59Z',NULL),
('upper','a','pending',300000,0,'2026-10-21T17:00Z',NULL),
('lower','a','pending',400000,0,'2026-09-30T17:00Z',NULL);
INSERT INTO payments VALUES
('pending',100000,false,'2026-10-20T10:00Z'),
('pending',-10000,false,'2026-10-20T11:00Z'),
('pending',50000,true,NULL),
('other',5000,false,'2026-10-20T10:00Z'),
('done',10000,false,'2026-09-30T17:00Z'),
('upper',1000,false,'2026-10-21T17:00Z');`);
let checks=0;function equal(a,b){assert.equal(Number(a),b);checks++;}
let r=(await sql(orderSql))[0];equal(r.booked,2304000);equal(r.created_count,3);equal(r.revenue,100000);equal(r.completed,1);equal(r.processing,4);
equal((await sql(receiptSql))[0].coalesce,105000);
r=(await sql(orderSql,{...base,manager:false}))[0];equal(r.booked,2099000);equal(r.created_count,2);equal(r.revenue,100000);
equal((await sql(receiptSql,{...base,manager:false}))[0].coalesce,100000);
r=(await sql(orderSql,{...base,owner:'b'}))[0];equal(r.booked,205000);equal(r.created_count,1);equal(r.revenue,0);
equal((await sql(receiptSql,{...base,owner:'b'}))[0].coalesce,5000);
// A pending order has a visible value while completed money remains zero.
r=(await sql(orderSql,{...base,from:'2026-10-19T17:00Z',to:'2026-10-20T17:00Z',owner:'a'}))[0];equal(r.booked,1699000);equal(r.revenue,0);
console.log(`PASS ${checks} overview SQL assertions: pending, completion date, owner scopes, shipping, cancellation/return, VN midnight, signed receipts and opening balances.`);
await db.close();
