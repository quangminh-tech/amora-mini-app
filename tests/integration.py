"""Integration tests. Dedicated, EMPTY database only. Uses the running .NET API.
CI runs against PostgreSQL 17. Never point this at a business database.
"""
import os,json,time,urllib.request,urllib.error,uuid,base64
BASE=os.getenv('TEST_API_URL','http://127.0.0.1:8080')
EMAIL=os.getenv('TEST_ADMIN_EMAIL','admin@test.amora')
PASSWORD=os.getenv('TEST_ADMIN_PASSWORD','Initial-ci-only-password')
checks=0

def call(path,method='GET',data=None,token=None,expected=200,raw=None,content_type=None):
    global checks
    headers={}
    if token:headers['Authorization']='Bearer '+token
    if raw is None and data is not None:raw=json.dumps(data).encode();content_type='application/json'
    if content_type:headers['Content-Type']=content_type
    req=urllib.request.Request(BASE+path,data=raw,method=method,headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=95) as r:status=r.status;body=r.read()
    except urllib.error.HTTPError as e:status=e.code;body=e.read()
    assert status==expected,f'{method} {path}: expected {expected}, got {status}: {body[:400]!r}'
    checks+=1
    try:return json.loads(body) if body else None
    except (ValueError,UnicodeDecodeError):return body

def ok(condition,message):
    global checks
    assert condition,message
    checks+=1

def login(email,password):return call('/api/auth/login','POST',{'email':email,'password':password})['token']
def change(email,current,next_password):
    t=login(email,current)
    call('/api/auth/password','POST',{'currentPassword':current,'newPassword':next_password},t,204)
    call('/api/auth/me',token=t,expected=401)
    return login(email,next_password)

for attempt in range(60):
    try:
        with urllib.request.urlopen(BASE+'/health',timeout=2) as r:
            if r.status==200:break
    except Exception:time.sleep(1)
else:raise SystemExit('API chưa sẵn sàng sau 60 giây')
call('/api/products',expected=401)
a0=login(EMAIL,PASSWORD)
call('/api/products',token=a0,expected=428)
a=change(EMAIL,PASSWORD,'Manager-private-test-password')
users=call('/api/admin/users',token=a)
ok(len(users)==1,'Test requires a fresh, empty database')
admin_id=users[0]['id']
ids={}
for email,name,role in [('ctv1@test.amora','CTV Một','ctv'),('ctv2@test.amora','CTV Hai','ctv'),('manager2@test.amora','Quản lý Hai','manager')]:
    ids[email]=call('/api/admin/users','POST',{'email':email,'name':name,'role':role,'password':'Temporary-test-password'},a)['id']
b=change('ctv1@test.amora','Temporary-test-password','CTV-one-private-test-password')
c=change('ctv2@test.amora','Temporary-test-password','CTV-two-private-test-password')
call('/api/admin/users',token=b,expected=403)
call('/api/admin/backup',token=b,expected=403)
call('/api/settings','PUT',{},b,expected=403)
products=call('/api/products',token=a);ok(len(products['products'])==4,'Four real AMORA scents seeded')
p=products['products'][0]['id'];p2=products['products'][1]['id']
for channel,price,rate,minqty in [('retail',350000,10,1),('wholesale',300000,5,10),('b2b',280000,7,20)]:
    call('/api/products/'+p+'/prices','PUT',{'channel':channel,'unitPrice':price,'commissionRate':rate,'minQty':minqty},a,204)
cat=call('/api/products',token=b);ok(all(x['channel']=='retail' for x in cat['prices']),'CTV cannot read internal price channels')
call('/api/products/'+p+'/prices','PUT',{'channel':'retail','unitPrice':1,'commissionRate':100,'minQty':1},b,403)
customer={'name':'Khách thử nghiệm Nguyễn Ánh','phone':'0900000000','email':'client@example.test','address':'TP.HCM','company':'Công ty thử nghiệm'}
cu1=call('/api/customers','POST',customer,b)['id'];cu2=call('/api/customers','POST',{**customer,'name':'Khách của CTV Hai'},c)['id']
ok(all(x['owner_id']==ids['ctv1@test.amora'] for x in call('/api/customers',token=b)),'CTV customer list isolated')
call('/api/customers/'+cu1,'PUT',customer,c,403)
sale={'customerId':cu1,'channel':'retail','shipping':25000,'note':'Test integration','lines':[{'productId':p,'qty':2,'unitPrice':None}]}
call('/api/orders','POST',{**sale,'customerId':cu2},b,403)
call('/api/orders','POST',{**sale,'channel':'b2b'},b,403)
call('/api/orders','POST',{**sale,'lines':[{'productId':p,'qty':2,'unitPrice':1}]},b,403)
call('/api/orders','POST',{**sale,'lines':[{'productId':p2,'qty':2,'unitPrice':None}]},b,400)
call('/api/orders','POST',{**sale,'lines':[{'productId':p,'qty':0}]},b,400)
call('/api/orders','POST',{**sale,'lines':sale['lines']*2},b,400)
call('/api/orders','POST',{**sale,'channel':'b2b','lines':[{'productId':p,'qty':1}]},a,400)
oid=call('/api/orders','POST',sale,b)['id']
get=lambda:call('/api/orders/'+oid,token=a)
o=get();ok(o['record']['subtotal']==700000,'Server calculates totals');ok(o['record']['commission_total']==70000,'Commission excludes shipping')
call('/api/orders/'+oid,token=c,expected=403)
ok(all(x['owner_id']==ids['ctv2@test.amora'] for x in call('/api/orders',token=c)),'CTV order list isolated')
call('/api/orders/'+oid+'/status','POST',{'status':'confirmed','version':o['record']['version']},b,403)
call('/api/orders/'+oid+'/status','POST',{'status':'completed','version':o['record']['version']},a,400)
call('/api/orders/'+oid+'/status','POST',{'status':'confirmed','version':0},a,409)
call('/api/orders/'+oid+'/status','POST',{'status':'confirmed','version':o['record']['version']},a,204)
call('/api/orders/'+oid,'PUT',{**sale,'version':get()['record']['version']},b,400)
call('/api/products/'+p+'/prices','PUT',{'channel':'retail','unitPrice':400000,'commissionRate':20,'minQty':1},a,204)
o=get();ok(o['lines'][0]['unit_price']==350000 and o['lines'][0]['commission_rate']==10,'Old order snapshots unchanged after policy update')
call('/api/orders/'+oid+'/payment','POST',{'paid':725001,'reference':'overpay','version':o['record']['version']},a,400)
call('/api/orders/'+oid+'/payment','POST',{'paid':700000,'reference':'partial transfer','version':o['record']['version']},a,204)
o=get();call('/api/orders/'+oid+'/status','POST',{'status':'shipping','version':o['record']['version']},a,204)
o=get();call('/api/orders/'+oid+'/status','POST',{'status':'completed','version':o['record']['version']},a,204)
ok(len(call('/api/commissions',token=b))==0,'No commission while payment incomplete')
o=get();call('/api/orders/'+oid+'/payment','POST',{'paid':725000,'reference':'full transfer','version':o['record']['version']},a,204)
cm=call('/api/commissions',token=b);ok(len(cm)==1 and cm[0]['amount']==70000,'Exactly one commission generated')
call('/api/commissions/'+cm[0]['id']+'/status','POST',{'status':'approved','version':cm[0]['version']},b,403)
call('/api/commissions/'+cm[0]['id']+'/status','POST',{'status':'paid','version':cm[0]['version'],'reference':'skip approval'},a,400)
call('/api/commissions/'+cm[0]['id']+'/status','POST',{'status':'approved','version':cm[0]['version']},a,204)
cm=call('/api/commissions',token=a)[0]
call('/api/commissions/'+cm['id']+'/status','POST',{'status':'paid','version':cm['version'],'reference':''},a,400)
call('/api/commissions/'+cm['id']+'/status','POST',{'status':'paid','version':cm['version'],'reference':'BANK-TXN-TEST'},a,204)
call('/api/commissions/'+cm['id']+'/status','POST',{'status':'paid','version':cm['version'],'reference':'DUPLICATE'},a,409)
o=get();call('/api/orders/'+oid+'/status','POST',{'status':'returned','version':o['record']['version'],'reason':'test'},a,409)
call('/api/orders/'+oid+'/payment','POST',{'paid':0,'version':o['record']['version'],'reference':'correction'},a,409)
ok(len(call('/api/commissions',token=c))==0,'Commission list isolated')
# Cancellation and returns before payment of commissions.
oid2=call('/api/orders','POST',sale,b)['id'];o2=call('/api/orders/'+oid2,token=b)
call('/api/orders/'+oid2+'/status','POST',{'status':'cancelled','version':o2['record']['version'],'reason':''},b,400)
call('/api/orders/'+oid2+'/status','POST',{'status':'cancelled','version':o2['record']['version'],'reason':'Khách đổi ý'},b,204)
# Simultaneous updates must not overwrite each other.
from concurrent.futures import ThreadPoolExecutor
race_id=call('/api/orders','POST',sale,b)['id']
def race_status(_):
    req=urllib.request.Request(BASE+'/api/orders/'+race_id+'/status',method='POST',data=json.dumps({'status':'confirmed','version':1}).encode(),headers={'Authorization':'Bearer '+a,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=30) as response:return response.status
    except urllib.error.HTTPError as e:return e.code
with ThreadPoolExecutor(max_workers=2) as pool:statuses=list(pool.map(race_status,range(2)))
ok(sorted(statuses)==[204,409],'Concurrent updates: one succeeds, one receives conflict')
# Return before commission payment voids the pending commission.
return_id=call('/api/orders','POST',sale,b)['id']
for target in ['confirmed','shipping','completed']:
    current=call('/api/orders/'+return_id,token=a)['record']
    call('/api/orders/'+return_id+'/status','POST',{'status':target,'version':current['version']},a,204)
current=call('/api/orders/'+return_id,token=a)['record']
call('/api/orders/'+return_id+'/payment','POST',{'paid':825000,'version':current['version'],'reference':'Test fully collected'},a,204)
current=call('/api/orders/'+return_id,token=a)['record']
call('/api/orders/'+return_id+'/status','POST',{'status':'returned','version':current['version'],'reason':'Trả toàn bộ'},a,204)
returned_cm=[x for x in call('/api/commissions',token=a) if x['order_id']==return_id][0]
ok(returned_cm['status']=='void','Returned unpaid commission is voided')

# Quote policy, snapshots and versions.
qbody={**sale,'validUntil':'2099-12-31','terms':'Điều kiện tiếng Việt: thời gian 7–10 ngày.'}
qid=call('/api/quotes','POST',qbody,b)['id']
q=call('/api/quotes/'+qid,token=b)
ok(q['record']['subtotal']==800000,'New quote uses new price')
call('/api/quotes/'+qid,token=c,expected=403)
call('/api/quotes/'+qid,'PUT',{**qbody,'version':0},b,409)
call('/api/quotes/'+qid+'/status','POST',{'status':'sent','version':q['record']['version']},b,204)
q=call('/api/quotes/'+qid,token=b)
call('/api/quotes/'+qid,'PUT',{**qbody,'version':q['record']['version']},b,400)
s=call('/api/settings',token=a);s['ctvQuotes']=False;call('/api/settings','PUT',s,a,204)
call('/api/quotes','POST',qbody,b,403)
s['ctvQuotes']=True;call('/api/settings','PUT',s,a,204)
# Local image storage: real bytes, no database Base64.
boundary='amora-test-boundary'
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jUioAAAAASUVORK5CYII=')
def multipart(data):return (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+data+f'\r\n--{boundary}--\r\n'.encode())
iid=call('/api/products/'+p+'/images','POST',token=a,raw=multipart(png),content_type='multipart/form-data; boundary='+boundary)['id']
image=call('/api/images/'+iid,token=b);ok(image==png,'Uploaded bytes round-trip without Base64 in DB')
call('/api/products/'+p+'/images','POST',token=b,raw=multipart(png),content_type='multipart/form-data; boundary='+boundary,expected=403)
call('/api/products/'+p+'/images','POST',token=a,raw=multipart(b'<script>test</script>'),content_type='multipart/form-data; boundary='+boundary,expected=400)
original=next(x for x in products['products'] if x['id']==p)
product_body={'sku':original['sku'],'name':original['name'],'scentId':original['scent_id'],'description':original['description'],'unit':original['unit'],'active':False}
call('/api/products/'+p,'PUT',product_body,a,204)
hidden=call('/api/products',token=b)
ok(all(x['id']!=p for x in hidden['products']),'Hidden products not listed to CTV')
ok(all(x['product_id']!=p for x in hidden['prices']),'Prices for hidden products not leaked')
ok(all(x['product_id']!=p for x in hidden['images']),'Image metadata for hidden products not leaked')
call('/api/images/'+iid,token=b,expected=404)
call('/api/images/'+iid,token=a)
call('/api/products/'+p,'PUT',{**product_body,'active':True},a,204)
call('/api/images/'+iid,'DELETE',token=a,expected=204)
call('/api/images/'+iid,token=a,expected=404)
# Account caps, lock and session revocation.
for n in range(3,6):call('/api/admin/users','POST',{'email':f'ctv{n}@test.amora','name':f'CTV {n}','role':'ctv','password':'Temporary-test-password'},a)
call('/api/admin/users','POST',{'email':'ctv6@test.amora','name':'CTV 6','role':'ctv','password':'Temporary-test-password'},a,400)
call('/api/admin/users','POST',{'email':'manager3@test.amora','name':'Quản lý 3','role':'manager','password':'Temporary-test-password'},a,400)
call('/api/admin/users/'+admin_id,'PUT',{'email':EMAIL,'name':'Quản lý','active':False},a,400)
call('/api/admin/users/'+ids['ctv2@test.amora'],'PUT',{'email':'ctv2@test.amora','name':'CTV Hai','active':False},a,204)
call('/api/auth/me',token=c,expected=401)
call('/api/admin/users/'+ids['ctv1@test.amora']+'/reset-password','POST',{'password':'Another-temporary-password'},a,204)
call('/api/auth/me',token=b,expected=401)
call('/api/dashboard',token=a)
backup=call('/api/admin/backup',token=a)
ok(backup['format']=='amora-mini-backup-v1' and len(backup['tables']['users'])==7,'Backup complete and includes seven accounts')
ok('sessions' not in backup['tables'],'Active sessions never exported')
from pathlib import Path
backup_path=os.getenv('TEST_BACKUP_PATH')
if backup_path:Path(backup_path).write_text(json.dumps(backup,ensure_ascii=False))
call('/api/auth/logout','POST',token=a,expected=204)
call('/api/auth/me',token=a,expected=401)
print(f'PASS: {checks} API checks. Authorization, prices, snapshots, statuses, payments, commissions, quotes, images, seven-account cap, backup and token revocation.')
