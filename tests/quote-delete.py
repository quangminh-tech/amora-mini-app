"""Dedicated EMPTY database only. Includes earlier API, pricing and snapshot regressions."""
from pathlib import Path
import runpy,json,os
from concurrent.futures import ThreadPoolExecutor
scope=runpy.run_path(str(Path(__file__).with_name('quantity-pricing.py')))
call,a,ctv,base=scope['call'],scope['a'],scope['ctv'],scope['base']
other=base['change']('ctv3@test.amora','Temporary-test-password','CTV-three-delete-test-password')
body={'customerId':base['cu1'],'channel':'retail','shipping':0,'note':'Draft deletion test','validUntil':'2099-12-31','lines':[{'productId':scope['p1'],'qty':1}]}
def make(actor=a):
 id=call('/api/quotes','POST',body,actor)['id']
 return call('/api/quotes/'+id,token=actor)['record']
def path(q,version=None):return '/api/quotes/'+q['id']+'?version='+str(q['version'] if version is None else version)
q=make();call(path(q),'DELETE',expected=401)
call('/api/quotes/'+q['id'],'DELETE',token=a,expected=400)
call(path(q,0),'DELETE',token=a,expected=400)
call(path(q,99),'DELETE',token=a,expected=409)
assert call('/api/quotes/'+q['id'],token=a)['lines'],'Rejected deletion must retain lines'
call(path(q),'DELETE',token=ctv,expected=403)
call(path(q),'DELETE',token=a,expected=204)
call('/api/quotes/'+q['id'],token=a,expected=404)
call(path(q),'DELETE',token=a,expected=404)
# Own collaborator draft is deletable; another collaborator cannot delete it.
cq=make(ctv);call(path(cq),'DELETE',token=other,expected=403)
call(path(cq),'DELETE',token=ctv,expected=204)
# A manager may remove a collaborator draft and the audit retains its ID/code/owner.
managed=make(ctv);call(path(managed),'DELETE',token=a,expected=204)
# Global CTV permission is checked on DELETE too; manager is unaffected.
blocked=make(ctv)
s=call('/api/settings',token=a);s['ctvQuotes']=False;call('/api/settings','PUT',s,a,204)
call(path(blocked),'DELETE',token=ctv,expected=403)
call(path(blocked),'DELETE',token=a,expected=204)
s=call('/api/settings',token=a);s['ctvQuotes']=True;call('/api/settings','PUT',s,a,204)
# Edits invalidate the version seen in the list/confirmation.
stale=make();call('/api/quotes/'+stale['id'],'PUT',{**body,'version':stale['version']},a)
call(path(stale),'DELETE',token=a,expected=409)
fresh=call('/api/quotes/'+stale['id'],token=a)['record'];call(path(fresh),'DELETE',token=a,expected=204)
# Non-draft states and linked orders remain intact.
kept=[]
for status in ['sent','accepted','rejected']:
 q=make();call('/api/quotes/'+q['id']+'/status','POST',{'status':'sent','version':q['version']},a,204)
 q=call('/api/quotes/'+q['id'],token=a)['record']
 if status!='sent':
  call('/api/quotes/'+q['id']+'/status','POST',{'status':status,'version':q['version']},a,204)
  q=call('/api/quotes/'+q['id'],token=a)['record']
 call(path(q),'DELETE',token=a,expected=409)
 assert call('/api/quotes/'+q['id'],token=a)['lines']
 if status=='accepted':
  order=call('/api/quotes/'+q['id']+'/convert','POST',{'version':q['version']},a)['id']
  call(path(q),'DELETE',token=a,expected=409)
  assert call('/api/orders/'+order,token=a)['record']['source_quote_id']==q['id']
 kept.append(q['id'])
# Repeated concurrent clicks result in exactly one deletion.
race=make()
def remove(_):
 try:call(path(race),'DELETE',token=a,expected=204);return 204
 except AssertionError as e:
  assert 'got 404' in str(e);return 404
with ThreadPoolExecutor(max_workers=2) as pool:assert sorted(pool.map(remove,range(2)))==[204,404]
backup=call('/api/admin/backup',token=a)
assert all(q['id']!=managed['id'] for q in backup['tables']['quotes'])
assert all(l['quote_id']!=managed['id'] for l in backup['tables']['quote_lines'])
assert any(log['action']=='quote_draft_deleted' and log['entity_id']==managed['id'] for log in backup['tables']['audit_logs'])
assert all(any(q['id']==id for q in backup['tables']['quotes']) for id in kept)
assert any(c['id']==body['customerId'] for c in backup['tables']['customers'])
assert any(p['id']==scope['p1'] for p in backup['tables']['products'])
Path(os.getenv('TEST_BACKUP_PATH','quote-delete-test-backup.json')).write_text(json.dumps(backup,ensure_ascii=False))
print('PASS: draft deletion, own/other CTV and manager rights, CTV setting, invalid/stale version, status/link protection, repeated delete, atomic line removal, audit history and retained customer/product data.')
