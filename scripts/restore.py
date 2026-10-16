"""Restore manager-exported JSON into a schema-only empty database.
Requires: pip install 'psycopg[binary]'. Default: validate only.
DATABASE_URL is a libpq postgresql:// URL (not the .NET connection string).
Apply database/migrations/001_initial.sql with psql first; do not start API/seed.
"""
import argparse,json,os
from pathlib import Path
TABLES=['users','scents','products','product_images','prices','customers','orders','order_lines','quotes','quote_lines','commissions','audit_logs','settings','order_events']
p=argparse.ArgumentParser();p.add_argument('file');p.add_argument('--execute',action='store_true');args=p.parse_args()
data=json.loads(Path(args.file).read_text())
if data.get('format')!='amora-mini-backup-v1':raise ValueError('Định dạng không hỗ trợ')
if data.get('schema')!='001_initial.sql':raise ValueError('Schema không hỗ trợ')
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
                if count>1:raise ValueError('Database đích đã có dữ liệu settings.')
            elif count:raise ValueError(f'Database đích đã có dữ liệu {table}; từ chối ghi đè.')
        cur.execute('DELETE FROM settings')
        for table in TABLES:
            for row in data['tables'][table]:
                cur.execute(sql.SQL('INSERT INTO {} SELECT * FROM json_populate_record(NULL::{},%s::json)').format(sql.Identifier(table),sql.Identifier(table)),[json.dumps(row)])
        cur.execute('DELETE FROM sessions')
        cur.execute('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())')
        cur.execute("INSERT INTO schema_migrations(name) VALUES('001_initial.sql') ON CONFLICT DO NOTHING")
print('Đã khôi phục toàn bộ dữ liệu; mọi phiên đăng nhập cũ đều không được phục hồi.')
