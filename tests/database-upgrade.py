"""Restore v1-like business rows to an EMPTY test DB, upgrade to v2 and test constraints.
Needs TEST_UPGRADE_DATABASE_URL, TEST_BACKUP_PATH, psycopg[binary]. Never use a live DB.
"""
import os,json
from pathlib import Path
from decimal import Decimal
import psycopg
from psycopg import sql
root=Path(__file__).resolve().parents[1]
backup=json.loads(Path(os.environ['TEST_BACKUP_PATH']).read_text())['tables']
url=os.environ['TEST_UPGRADE_DATABASE_URL']
checks=0
with psycopg.connect(url) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
        assert cur.fetchone()[0]==0,'Requires empty test DB'
        cur.execute((root/'database/migrations/001_initial.sql').read_text())
        cur.execute('DELETE FROM settings')
        for table,rows in backup.items():
            if table in ('payments','product_categories','customer_groups','product_models','import_batches'):continue
            for row in rows:
                if table=='settings' and row['key']!='business':continue
                cur.execute(sql.SQL('INSERT INTO {} SELECT * FROM json_populate_record(NULL::{},%s::json)').format(sql.Identifier(table),sql.Identifier(table)),[json.dumps(row)])
        cur.execute('SELECT id,customer_snapshot,subtotal,paid,owner_id FROM orders ORDER BY id');before=cur.fetchall()
        cur.execute('SELECT id,customer_snapshot,seller_snapshot,subtotal FROM quotes ORDER BY id');quotes=cur.fetchall()
        cur.execute((root/'database/migrations/002_ctv_workspace.sql').read_text())
        cur.execute('SELECT id,customer_snapshot,subtotal,paid,owner_id FROM orders ORDER BY id');assert cur.fetchall()==before
        cur.execute('SELECT id,customer_snapshot,seller_snapshot,subtotal FROM quotes ORDER BY id');assert cur.fetchall()==quotes
        cur.execute('SELECT count(*) FROM payments WHERE NOT opening_balance OR occurred_at IS NOT NULL');assert cur.fetchone()[0]==0
        cur.execute('SELECT count(*) FROM orders o WHERE o.paid<>(SELECT COALESCE(sum(p.amount),0) FROM payments p WHERE p.order_id=o.id)');assert cur.fetchone()[0]==0
        cur.execute((root/'database/migrations/003_catalogue_workspace.sql').read_text())
        cur.execute('SELECT count(*) FROM products WHERE model_id IS NULL');assert cur.fetchone()[0]==0
        cur.execute('SELECT count(*) FROM customers c LEFT JOIN customer_groups g ON g.id=c.group_id WHERE g.id IS NULL');assert cur.fetchone()[0]==0
        for migration in ['004_product_colours.sql','005_document_templates.sql']:cur.execute((root/'database/migrations'/migration).read_text())
        cur.execute("SELECT count(*) FROM products WHERE color_label<>''");assert cur.fetchone()[0]==0
        cur.execute("SELECT count(*) FROM quotes WHERE document_snapshot<>'{}'::jsonb");assert cur.fetchone()[0]==0
        checks+=8
        cur.execute('SELECT id FROM orders LIMIT 1');order=cur.fetchone()[0]
        cur.execute('SELECT id FROM quotes LIMIT 1');quote=cur.fetchone()[0]
        cur.execute('SELECT id FROM users LIMIT 1');user=cur.fetchone()[0]
    conn.commit()
    conn.autocommit=True
    def reject(statement,params=(),state='23514'):
        global checks
        try:
            with conn.transaction():
                conn.execute(statement,params)
                conn.execute('SET CONSTRAINTS ALL IMMEDIATE')
        except psycopg.Error as error:
            assert error.sqlstate==state,(error.sqlstate,str(error));checks+=1
        else:raise AssertionError('Invalid data accepted: '+statement)
    reject('UPDATE orders SET subtotal=subtotal+1 WHERE id=%s',[order])
    reject('UPDATE quotes SET subtotal=subtotal+1 WHERE id=%s',[quote])
    reject('UPDATE order_lines SET amount=amount+1 WHERE order_id=%s',[order])
    reject('UPDATE quote_lines SET qty=qty+1,amount=(qty+1)*unit_price WHERE quote_id=%s',[quote])
    reject('UPDATE payments SET amount=amount+1')
    reject('DELETE FROM payments')
    reject("INSERT INTO payments(id,order_id,actor_id,amount,reference,occurred_at) VALUES(gen_random_uuid(),%s,%s,1,'invalid balance',now())",[order,user])
    reject('UPDATE products SET lead_days_min=20,lead_days_max=10')
    reject("INSERT INTO customers(id,owner_id,name) VALUES(gen_random_uuid(),gen_random_uuid(),'Invalid owner')",state='23503')
    reject("INSERT INTO users(id,email,name,password_hash,role) SELECT gen_random_uuid(),upper(email),'Duplicate','unused','ctv' FROM users LIMIT 1",state='23505')
    # Valid correction: both cached total and immutable ledger reconcile within ONE transaction.
    with conn.transaction():
        conn.execute('UPDATE orders SET paid=paid-1 WHERE id=(SELECT order_id FROM payments WHERE amount>0 LIMIT 1)')
        conn.execute("INSERT INTO payments(id,order_id,actor_id,amount,reference,occurred_at) SELECT gen_random_uuid(),order_id,%s,-1,'test correction',now() FROM payments WHERE amount>0 LIMIT 1",[user])
    checks+=1
print(f'PASS: {checks} database upgrade/integrity checks; v1 snapshots and balances preserved, immutable ledger, deferred document totals, FK and normalized email enforced.')
