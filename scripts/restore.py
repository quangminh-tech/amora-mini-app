"""Restore manager-exported JSON into a schema-only empty database.
Requires: pip install 'psycopg[binary]'. Default: validate only.
DATABASE_URL is a libpq postgresql:// URL (not the .NET connection string).
Apply all migrations up to the backup schema with psql first; do not start API/seed.
"""
import argparse,json,os
from pathlib import Path
TABLES=['users','scents','products','product_images','prices','customers','orders','order_lines','quotes','quote_lines','commissions','audit_logs','settings','order_events']
p=argparse.ArgumentParser();p.add_argument('file');p.add_argument('--execute',action='store_true');args=p.parse_args()
data=json.loads(Path(args.file).read_text())
if data.get('format')!='amora-mini-backup-v1':raise ValueError('Định dạng không hỗ trợ')
schema=data.get('schema')
if schema not in ('001_initial.sql','002_ctv_workspace.sql','003_catalogue_workspace.sql'):raise ValueError('Schema không hỗ trợ')
if schema in ('002_ctv_workspace.sql','003_catalogue_workspace.sql'):TABLES.append('payments')
if schema=='003_catalogue_workspace.sql':TABLES=['users','scents','product_categories','customer_groups','product_models','products','product_images','prices','customers','quotes','quote_lines','orders','order_lines','payments','commissions','audit_logs','settings','order_events','import_batches']
if not isinstance(data.get('tables'),dict) or set(data['tables'])!=set(TABLES):raise ValueError('Danh sách bảng không hợp lệ')
if not all(isinstance(data['tables'][t],list) for t in TABLES):raise ValueError('Dữ liệu bảng không hợp lệ')
print('Bản sao hợp lệ:',sum(len(data['tables'][t]) for t in TABLES),'dòng. Ảnh cần khôi phục riêng từ R2.')
if not args.execute:
    print('Chưa ghi dữ liệu. Thêm --execute và DATABASE_URL khi database đích chỉ có schema.');raise SystemExit(0)
import psycopg
from psycopg import sql
with psycopg.connect(os.environ['DATABASE_URL']) as conn:
    with conn.cursor() as cur:
        cur.execute('SELECT pg_advisory_xact_lock(71352019)')
        # settings has a default row from initial migration: allow only this row.
        for table in TABLES:
            cur.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(table)))
            count=cur.fetchone()[0]
            if table=='settings':
                if count>(1 if schema=='001_initial.sql' else 2):raise ValueError('Database đích đã có dữ liệu settings.')
            elif schema=='003_catalogue_workspace.sql' and table in ('product_categories','customer_groups'):
                expected={'product_categories':{('CANDLE','Nến thơm'),('MINI','Sáp mini'),('GIFT','Set quà'),('ACCESSORY','Phụ kiện')},'customer_groups':{('UNCLASSIFIED','Chưa phân loại'),('RETAIL','Khách lẻ'),('WHOLESALE','Khách sỉ'),('BUSINESS','Doanh nghiệp')}}[table]
                cur.execute(sql.SQL('SELECT code,name FROM {} WHERE active AND version=1').format(sql.Identifier(table)))
                defaults=set(cur.fetchall())
                if count!=len(expected) or defaults!=expected:raise ValueError('Database đích có danh mục đã thay đổi; từ chối ghi đè.')
            elif count:raise ValueError(f'Database đích đã có dữ liệu {table}; từ chối ghi đè.')
        cur.execute('DELETE FROM settings')
        if schema=='003_catalogue_workspace.sql':
            cur.execute('DELETE FROM customer_groups');cur.execute('DELETE FROM product_categories')
        for table in TABLES:
            for row in data['tables'][table]:
                cur.execute(sql.SQL('INSERT INTO {} SELECT * FROM json_populate_record(NULL::{},%s::json)').format(sql.Identifier(table),sql.Identifier(table)),[json.dumps(row)])
        cur.execute('DELETE FROM sessions')
        cur.execute('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())')
        for name in ['001_initial.sql']+(['002_ctv_workspace.sql'] if schema in ('002_ctv_workspace.sql','003_catalogue_workspace.sql') else [])+(['003_catalogue_workspace.sql'] if schema=='003_catalogue_workspace.sql' else []):
            cur.execute('INSERT INTO schema_migrations(name) VALUES(%s) ON CONFLICT DO NOTHING',[name])
print('Đã khôi phục toàn bộ dữ liệu; mọi phiên đăng nhập cũ đều không được phục hồi.')
