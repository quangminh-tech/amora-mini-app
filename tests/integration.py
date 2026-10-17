"""Integration tests. Dedicated, EMPTY database only. Uses the running .NET API.
CI runs against PostgreSQL 17. Never point this at a business database.
"""
import os,json,time,urllib.request,urllib.error,urllib.parse,uuid,base64
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
    req=urllib.request.Request(BASE+urllib.parse.quote(path,safe="/?=&%:-+"),data=raw,method=method,headers=headers)
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
health=call('/health')
ok(health['status']=='ok' and health['service']=='amora-mini','Liveness identifies API, no DB probe')
call('/api/products',expected=401)
a0=login(EMAIL,PASSWORD)
call('/api/products',token=a0,expected=428)
a=change(EMAIL,PASSWORD,'Manager-private-test-password')
users=call('/api/admin/users',token=a)
ok(len(users)==1,'Test requires a fresh, empty database')
admin_id=users[0]['id']
call('/api/admin/readiness',token=a)
call('/api/admin/storage-check','POST',token=a)
ids={}
for email,name,role in [('ctv1@test.amora','CTV Một','ctv'),('ctv2@test.amora','CTV Hai','ctv'),('manager2@test.amora','Quản lý Hai','manager')]:
    ids[email]=call('/api/admin/users','POST',{'email':email,'name':name,'role':role,'password':'Temporary-test-password'},a)['id']
b=change('ctv1@test.amora','Temporary-test-password','CTV-one-private-test-password')
c=change('ctv2@test.amora','Temporary-test-password','CTV-two-private-test-password')
call('/api/admin/users',token=b,expected=403)
call('/api/admin/readiness',token=b,expected=403)
call('/api/admin/storage-check','POST',token=b,expected=403)
call('/api/admin/backup',token=b,expected=403)
call('/api/settings','PUT',{},b,expected=403)
models=call('/api/models',token=a);scents=call('/api/scents',token=a)
ok(len(models)==4 and len(scents)==4,'Four model names and scents seeded without guessed SKUs or prices')
ok(call('/api/products',token=a)['total']==0,'Fresh app contains no guessed sizes or commercial prices')
for i,model in enumerate(models):
    scent=next(x for x in scents if x['name']==model['name'])
    call('/api/products','POST',{'sku':f'TEST-{i+1:02}','modelId':model['id'],'sizeLabel':'100g','scentId':scent['id'],'unit':'lọ'},a)
products=call('/api/products',token=a);ok(len(products['products'])==4,'Four explicit test SKUs')
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
call('/api/products/'+p+'/prices','PUT',{'channel':'retail','unitPrice':400000,'commissionRate':20,'minQty':1,'version':1},a,204)
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
s=call('/api/settings',token=a);s['ctvQuotes']=True;call('/api/settings','PUT',s,a,204)
# Local image storage: real bytes, no database Base64.
boundary='amora-test-boundary'
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jUioAAAAASUVORK5CYII=')
def multipart(data):return (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+data+f'\r\n--{boundary}--\r\n'.encode())
iid=call('/api/products/'+p+'/images','POST',token=a,raw=multipart(png),content_type='multipart/form-data; boundary='+boundary)['id']
image=call('/api/images/'+iid,token=b);ok(image==png,'Uploaded bytes round-trip without Base64 in DB')
call('/api/products/'+p+'/images','POST',token=b,raw=multipart(png),content_type='multipart/form-data; boundary='+boundary,expected=403)
call('/api/products/'+p+'/images','POST',token=a,raw=multipart(b'<script>test</script>'),content_type='multipart/form-data; boundary='+boundary,expected=400)
original=next(x for x in products['products'] if x['id']==p)
product_body={'sku':original['sku'],'name':original['name'],'scentId':original['scent_id'],'description':original['description'],'unit':original['unit'],'active':False,'version':original['version'],'modelId':original['model_id'],'sizeLabel':original['size_label']}
call('/api/products/'+p,'PUT',product_body,a,204)
hidden=call('/api/products',token=b)
ok(all(x['id']!=p for x in hidden['products']),'Hidden products not listed to CTV')
ok(all(x['product_id']!=p for x in hidden['prices']),'Prices for hidden products not leaked')
ok(all(x['product_id']!=p for x in hidden['images']),'Image metadata for hidden products not leaked')
call('/api/images/'+iid,token=b,expected=404)
call('/api/images/'+iid,token=a)
call('/api/products/'+p,'PUT',{**product_body,'active':True,'version':original['version']+1},a,204)
call('/api/images/'+iid,'DELETE',token=a,expected=204)
call('/api/images/'+iid,token=a,expected=404)
# Active-account limits are configurable, checked atomically.
limits=call('/api/admin/account-limits',token=a)
call('/api/admin/account-limits','PUT',{'managers':2,'ctvs':5,'version':limits['version']},a,204)
call('/api/admin/account-limits',token=b,expected=403)
# Catalogue pages keep selected items and do not leak hidden/internal data.
catpage=call('/api/products?page=1&pageSize=1',token=b)
ok(catpage['total']==4 and len(catpage['products'])==1,'Catalogue is server-paged')
selected=call('/api/products?page=1&pageSize=1&search=DOES_NOT_EXIST&includeIds='+p,token=b)
ok(selected['total']==0 and len(selected['products'])==1 and selected['products'][0]['id']==p,'Remote product search preserves selected quote lines')
call('/api/products?page=0',token=a,expected=400)
call('/api/products?page=1&pageSize=101',token=a,expected=400)
# Account caps, lock and session revocation.
for n in range(3,6):call('/api/admin/users','POST',{'email':f'ctv{n}@test.amora','name':f'CTV {n}','role':'ctv','password':'Temporary-test-password'},a)
call('/api/admin/users','POST',{'email':'ctv6@test.amora','name':'CTV 6','role':'ctv','password':'Temporary-test-password'},a,400)
call('/api/admin/users','POST',{'email':'manager3@test.amora','name':'Quản lý 3','role':'manager','password':'Temporary-test-password'},a,400)
call('/api/admin/users/'+admin_id,'PUT',{'email':EMAIL,'name':'Quản lý','active':False},a,400)
call('/api/admin/users/'+ids['ctv2@test.amora'],'PUT',{'email':'ctv2@test.amora','name':'CTV Hai','active':False,'version':1},a,204)
call('/api/auth/me',token=c,expected=401)

# v2: paging/search cannot expose another CTV's data, nor drop older documents.
page=call('/api/quotes?page=1&pageSize=1',token=b)
ok(page['total']>=1 and len(page['items'])==1,'Quotes expose page metadata')
call('/api/quotes?page=0',token=a,expected=400)
call('/api/orders?page=1&pageSize=101',token=a,expected=400)
call('/api/customers?page=1&ownerId='+ids['ctv2@test.amora'],token=b,expected=403)
page=call('/api/customers?page=1&pageSize=1&search=example.test',token=b)
ok(page['total']==1 and page['items'][0]['id']==cu1,'Server-side email search and ownership')
row=page['items'][0]
call('/api/customers/'+cu1,'PUT',{**customer,'name':'Khách đổi tên','version':row['version']},b,204)
call('/api/customers/'+cu1,'PUT',{**customer,'version':row['version']},b,409)
ok(get()['record']['customer_snapshot'] is not None,'Historical customer snapshot remains available')
ledger=get()['payments'];ok(sum(x['amount'] for x in ledger)==get()['record']['paid'],'Ledger reconciles to paid balance')
ok(len(ledger)==2 and all(not x['opening_balance'] for x in ledger),'Each receipt becomes an immutable entry')
dash=call('/api/dashboard',token=b)
ok(dash['team'] is None and 'quotes' in dash and 'work' in dash,'CTV dashboard excludes team totals')
call('/api/products/'+p+'/prices','PUT',{'channel':'retail','unitPrice':1,'commissionRate':0,'minQty':1,'version':1},a,409)
call('/api/products/'+p,'PUT',product_body,a,409)
limits=call('/api/admin/account-limits',token=a)
call('/api/admin/account-limits','PUT',{'managers':1,'ctvs':5,'version':limits['version']},a,400)
call('/api/admin/account-limits','PUT',{'managers':2,'ctvs':8,'version':limits['version']},a,204)
call('/api/admin/account-limits','PUT',{'managers':2,'ctvs':8,'version':limits['version']},a,409)
team=call('/api/admin/users?page=1&role=ctv',token=a)
ok(team['total']==5 and all('quotes_count' in x and 'outstanding' in x for x in team['items']),'CTV management includes independent aggregate metrics')
summary=call('/api/commissions/summary',token=b)
ok(summary['paid']>=70000,'Commission summary is computed over all records, not current page')

# v3: structured categories, variants, tabular directory data and snapshots.
groups=call('/api/directories/customer-groups',token=a)
retail=next(x for x in groups if x['code']=='RETAIL')
category=call('/api/directories/product-categories',token=a)[0]
call('/api/directories/product-categories','POST',{'code':'TEST-GROUP','name':'Nhóm kiểm tra'},b,403)
call('/api/products','POST',{'sku':'TEST-DUP-COMBINATION','modelId':original['model_id'],'sizeLabel':original['size_label'],'scentId':original['scent_id']},a,409)
second_size=call('/api/products','POST',{'sku':'SIZE-220','modelId':original['model_id'],'sizeLabel':'220g','scentId':original['scent_id']},a)['id']
call('/api/products/'+second_size+'/prices','PUT',{'channel':'retail','unitPrice':500000,'commissionRate':12,'minQty':2},a,204)
call('/api/orders','POST',{**sale,'lines':[{'productId':second_size,'qty':1}]},b,400)
newcu=call('/api/customers','POST',{'name':'Khách phân loại','phone':'+84 901 234 567','groupId':retail['id'],'note':'Giữ ghi chú'},b)['id']
filtered=call('/api/customers?page=1&group=RETAIL',token=b)
ok(filtered['total']==1 and filtered['items'][0]['id']==newcu,'Customer classification independent of price channel')
call('/api/customers/'+newcu,'PUT',{'name':'Khách phân loại','groupId':retail['id'],'version':0},b,409)
# Accepted quote becomes exactly one order, preserving agreed price and variant.
q2=call('/api/quotes','POST',{**qbody,'lines':[{'productId':second_size,'qty':2}]},b)['id']
qr=call('/api/quotes/'+q2,token=b)['record']
call('/api/quotes/'+q2+'/convert','POST',{'version':qr['version']},b,400)
call('/api/quotes/'+q2+'/status','POST',{'status':'sent','version':qr['version']},b,204)
qr=call('/api/quotes/'+q2,token=b)['record'];call('/api/quotes/'+q2+'/status','POST',{'status':'accepted','version':qr['version']},b,204)
qr=call('/api/quotes/'+q2,token=b)['record']
call('/api/products/'+second_size+'/prices','PUT',{'channel':'retail','unitPrice':600000,'commissionRate':20,'minQty':2,'version':1},a,204)
converted=call('/api/quotes/'+q2+'/convert','POST',{'version':qr['version']},b)
again=call('/api/quotes/'+q2+'/convert','POST',{'version':qr['version']},b)
ok(converted['id']==again['id'] and again['alreadyConverted'],'Quote conversion is idempotent')
line=call('/api/orders/'+converted['id'],token=b)['lines'][0]
ok(line['unit_price']==500000 and line['commission_rate']==12 and '220g' in line['product_name'] and line['lead_days_min']==7 and line['lead_days_max']==10,'Quoted price, commission and size snapshot retained after pricing changes')
call('/api/overview?from=2026-01-01&to=2026-12-31&ownerId='+ids['ctv2@test.amora'],token=b,expected=403)
call('/api/overview?from=invalid',token=a,expected=400)
ov=call('/api/overview',token=b);ok(ov['team']==[],'CTV overview has no team data')
# Excel uses a real zipped OpenXML workbook, including Vietnamese and text phone numbers.
import io,zipfile,xml.etree.ElementTree as ET
NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def xlsx(headers,rows,formula=False):
    worksheet=ET.Element(NS+'worksheet');sheet=ET.SubElement(worksheet,NS+'sheetData')
    for n,values in enumerate([headers]+rows,1):
        row=ET.SubElement(sheet,NS+'row',r=str(n))
        for i,value in enumerate(values):
            col='';j=i+1
            while j:j,k=divmod(j-1,26);col=chr(65+k)+col
            cell=ET.SubElement(row,NS+'c',r=col+str(n),t='inlineStr');is_=ET.SubElement(cell,NS+'is');ET.SubElement(is_,NS+'t').text=str(value)
            if formula and n==2 and i==0:ET.SubElement(cell,NS+'f').text='1+1'
    buffer=io.BytesIO()
    with zipfile.ZipFile(buffer,'w') as z:z.writestr('xl/worksheets/sheet1.xml',ET.tostring(worksheet))
    return buffer.getvalue()
def preview(kind,headers,rows,mode='create',actor=a,formula=False):
    boundary='amora-xlsx-boundary'
    data=(f'--{boundary}\r\nContent-Disposition: form-data; name="mode"\r\n\r\n{mode}\r\n--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n'.encode()+xlsx(headers,rows,formula)+f'\r\n--{boundary}--\r\n'.encode())
    return call('/api/transfers/'+kind+'/preview','POST',token=actor,raw=data,content_type='multipart/form-data; boundary='+boundary,expected=400 if formula else 200)
def commit(kind,pre,actor=a,expected=200):return call('/api/transfers/'+kind+'/'+pre['id']+'/commit','POST',token=actor,expected=expected)
call('/api/transfers/products/template',token=b,expected=403)
call('/api/transfers/users/export',token=b,expected=403)
raw=call('/api/transfers/products/export',token=b)
if os.getenv('TEST_XLSX_PATH'):
    from pathlib import Path
    Path(os.environ['TEST_XLSX_PATH']).write_bytes(raw)
with zipfile.ZipFile(io.BytesIO(raw)) as z:
    values=[x.text or '' for x in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).iter(NS+'t')]
    ok('Size / quy cách' in values and '220g' in values,'XLSX export carries variant sizes as text')
preview('customers',['Tên'],[['Formula']],actor=b,formula=True)
bad=preview('customers',['Tên','Mã nhóm khách'],[['Hợp lệ','RETAIL'],['Sai nhóm','DOES-NOT-EXIST']],actor=b)
ok(not bad['valid'] and bad['id'] is None,'Invalid row prevents commit token for the entire batch')
ok(call('/api/customers?page=1&search=Hợp lệ',token=b)['total']==0,'Preview writes no business data')
pre=preview('customers',['Tên','Điện thoại','Mã nhóm khách'],[['Khách Excel','0900000001','RETAIL']],actor=b)
ok(pre['valid'] and call('/api/customers?page=1&search=Khách Excel',token=b)['total']==0,'Valid preview is still read-only')
commit('customers',pre,actor=a,expected=404)
commit('customers',pre,actor=b);commit('customers',pre,actor=b,expected=409)
cu=call('/api/customers?page=1&search=Khách Excel',token=b)['items'][0]
update=preview('customers',['ID','Phiên bản','Tên','Điện thoại'],[[cu['id'],cu['version'],'Khách Excel sửa','']],mode='update',actor=b)
commit('customers',update,actor=b)
cu=call('/api/customers?page=1&search=Khách Excel sửa',token=b)['items'][0];ok(cu['phone']=='0900000001','Blank update preserves previous text phone')
clear=preview('customers',['ID','Phiên bản','Điện thoại'],[[cu['id'],cu['version'],'[XÓA]']],mode='update',actor=b);commit('customers',clear,actor=b)
cu=call('/api/customers?page=1&search=Khách Excel sửa',token=b)['items'][0];ok(cu['phone']=='','Explicit clearing survives preview and commit')
stale=preview('customers',['ID','Phiên bản','Tên'],[[cu['id'],cu['version'],'Sửa khi cũ']],mode='update',actor=b)
call('/api/customers/'+cu['id'],'PUT',{'name':'Khách Excel mới hơn','version':cu['version']},b,204)
commit('customers',stale,actor=b,expected=409)
# Directory, model, SKU and price can each be created through validated imports.
pre=preview('product-categories',['Mã','Tên'],[['IMPORT-CAT','Nhóm từ Excel']]);commit('product-categories',pre)
pre=preview('models',['Mã','Tên','Mã nhóm sản phẩm'],[['IMPORT-MODEL','Mẫu từ Excel','IMPORT-CAT']]);commit('models',pre)
pre=preview('products',['SKU','Mã mẫu','Size / quy cách','Đơn vị'],[['IMPORT-SKU','IMPORT-MODEL','Set 2 lọ','bộ']]);commit('products',pre)
pre=preview('prices',['SKU','Kênh giá','Đơn giá','MOQ','Hoa hồng %'],[['IMPORT-SKU','retail','700000','1','8.5']]);commit('prices',pre)
ok(call('/api/products?page=1&search=IMPORT-SKU',token=a)['prices'][0]['unit_price']==700000,'Imported prices match structured SKU')
pre=preview('products',['SKU','Mã mẫu','Size / quy cách'],[['DOUBLE-1','IMPORT-MODEL','Set 2 lọ'],['DOUBLE-2','IMPORT-MODEL','Size mới']])
ok(not pre['valid'],'Duplicate model/scent/size combination is rejected')
pre=preview('users',['Tên','Email','Vai trò'],[['CTV Excel','ctvexcel@test.amora','ctv']]);ok(pre['valid'] and all(x['temporaryPassword']=='' for x in pre['rows']),'Preview never creates or reveals account passwords')
created=commit('users',pre);password=created['temporaryAccounts'][0]['password'];t=login('ctvexcel@test.amora',password);call('/api/products',token=t,expected=428)
# Hidden parent groups hide variants and their price rows from CTV, including includeIds.
cat=next(g for g in call('/api/directories/product-categories',token=a) if g['code']=='IMPORT-CAT')
call('/api/directories/product-categories/'+cat['id'],'PUT',{'code':cat['code'],'name':cat['name'],'active':False,'version':cat['version']},a,204)
ok(call('/api/products?page=1&search=IMPORT-SKU',token=b)['total']==0,'Inactive group suppresses variants for CTV')
# Admin product deletion: unused SKU only, stale versions and historical links protected.
active_category=next(g for g in call('/api/directories/product-categories',token=a) if g['active'])
delete_model=call('/api/models','POST',{'code':'DELETE-MODEL','name':'Mẫu để xóa','categoryId':active_category['id']},a)['id']
delete_sku=call('/api/products','POST',{'sku':'DELETE-SKU','modelId':delete_model,'sizeLabel':'Thử xóa'},a)['id']
call('/api/products/'+delete_sku+'/prices','PUT',{'channel':'retail','unitPrice':123000,'commissionRate':0,'minQty':1},a,204)
delete_image=call('/api/products/'+delete_sku+'/images','POST',token=a,raw=multipart(png),content_type='multipart/form-data; boundary='+boundary)['id']
call('/api/products/'+delete_sku+'?version=1','DELETE',token=b,expected=403)
call('/api/models/'+delete_model+'?version=1','DELETE',token=b,expected=403)
call('/api/products/'+delete_sku+'?version=0','DELETE',token=a,expected=409)
call('/api/models/'+delete_model+'?version=1','DELETE',token=a,expected=409)
removed=call('/api/products/'+delete_sku+'?version=1','DELETE',token=a)
ok(removed['pendingImages']==0,'Unused SKU deletes prices and stored image after database commit')
call('/api/images/'+delete_image,token=a,expected=404)
ok(call('/api/products?page=1&search=DELETE-SKU',token=a)['total']==0,'Deleted SKU no longer appears in catalogue')
call('/api/products/'+delete_sku+'?version=1','DELETE',token=a,expected=404)
call('/api/models/'+delete_model+'?version=0','DELETE',token=a,expected=409)
call('/api/models/'+delete_model+'?version=1','DELETE',token=a,expected=204)
used=next(x for x in call('/api/products?includeIds='+p,token=a)['products'] if x['id']==p)
call('/api/products/'+p+'?version='+str(used['version']),'DELETE',token=a,expected=409)
ok(get()['lines'][0]['product_id']==p,'Historical order remains linked after rejected deletion')
call('/api/admin/users/'+ids['ctv1@test.amora']+'/reset-password','POST',{'password':'Another-temporary-password'},a,204)
call('/api/auth/me',token=b,expected=401)
call('/api/dashboard',token=a)
backup=call('/api/admin/backup',token=a)
ok(backup['format']=='amora-mini-backup-v1' and len(backup['tables']['users'])==8,'Backup complete and includes seven accounts')
ok('sessions' not in backup['tables'],'Active sessions never exported')
from pathlib import Path
backup_path=os.getenv('TEST_BACKUP_PATH')
if backup_path:Path(backup_path).write_text(json.dumps(backup,ensure_ascii=False))
call('/api/auth/logout','POST',token=a,expected=204)
call('/api/auth/me',token=a,expected=401)
print(f'PASS: {checks} API checks. Authorization, prices, snapshots, statuses, payments, commissions, quotes, images, configurable active-account limits, backup and token revocation.')
