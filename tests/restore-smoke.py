"""Validate restore end-to-end. Dedicated EMPTY test database only.
Requires psycopg[binary], TEST_RESTORE_DATABASE_URL and TEST_BACKUP_PATH.
"""
import os,json,subprocess,sys
from pathlib import Path
import psycopg
root=Path(__file__).resolve().parents[1]
url=os.environ['TEST_RESTORE_DATABASE_URL'];backup=Path(os.environ['TEST_BACKUP_PATH'])
expected=json.loads(backup.read_text())['tables']
with psycopg.connect(url) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
        assert cur.fetchone()[0]==0,'Restore test requires an empty dedicated database'
        for migration in sorted((root/'database/migrations').glob('*.sql')):cur.execute(migration.read_text())
env={**os.environ,'DATABASE_URL':url}
subprocess.run([sys.executable,str(root/'scripts/restore.py'),str(backup)],env=env,check=True)
subprocess.run([sys.executable,str(root/'scripts/restore.py'),str(backup),'--execute'],env=env,check=True)
with psycopg.connect(url) as conn:
    with conn.cursor() as cur:
        for table,rows in expected.items():
            from psycopg import sql
            cur.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(table)))
            assert cur.fetchone()[0]==len(rows),table
        if json.loads(backup.read_text())['schema']=='005_document_templates.sql':
            for row in expected['quotes']:
                cur.execute('SELECT document_snapshot FROM quotes WHERE id=%s',[row['id']]);assert cur.fetchone()[0]==row['document_snapshot']
        cur.execute('SELECT count(*) FROM sessions');assert cur.fetchone()[0]==0
        cur.execute('SELECT count(*) FROM schema_migrations');assert cur.fetchone()[0]==len(list((root/'database/migrations').glob('*.sql')))
result=subprocess.run([sys.executable,str(root/'scripts/restore.py'),str(backup),'--execute'],env=env,capture_output=True,text=True)
assert result.returncode!=0 and 'từ chối ghi đè' in result.stderr,'Must reject restore over existing data'
print('PASS: JSON restore, exact row counts for all 19 tables, no sessions, migration ledger and refusal to overwrite existing data.')
