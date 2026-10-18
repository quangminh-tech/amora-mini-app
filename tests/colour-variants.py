"""Run after integration.py in the same isolated test process/database."""
from pathlib import Path
import runpy,io,zipfile,json
base=runpy.run_path(str(Path(__file__).with_name('integration.py')))
call,ok=base['call'],base['ok']
a=base['login'](base['EMAIL'],'Manager-private-test-password')
cat=call('/api/directories/product-categories','POST',{'name':'Nến thử màu','code':'COLOURTEST'},a)['id']
model=call('/api/models','POST',{'code':'NT-0001','name':'Nến AMORA','categoryId':cat},a)['id']
scent=call('/api/directories/scents','POST',{'name':'White Tea'},a)['id']
def body(size='110g',color='Đen',**extra):return {'sku':'','modelId':model,'scentId':scent,'sizeLabel':size,'colorLabel':color,**extra}
p=body()
preview=call('/api/products/sku-preview','POST',p,a)
assert preview['sku']=='NT-0001-WT-110-DEN',preview
assert not call('/api/products?modelId='+model,token=a)['products'],'Preview must not persist'
items=[{'product':body(size,color),'retail':{'channel':'retail','unitPrice':120000 if size=='110g' else 220000,'commissionRate':10,'minQty':1}} for size in ['110g','220g'] for color in ['Đen','Trắng']]
batch=call('/api/products/batch','POST',{'items':items},a)
assert batch['count']==4
ps=call('/api/products?modelId='+model,token=a)
assert {x['sku'] for x in ps['products']}=={'NT-0001-WT-110-DEN','NT-0001-WT-110-TRANG','NT-0001-WT-220-DEN','NT-0001-WT-220-TRANG'}
assert len(ps['prices'])==4
assert all(x['color_label'] in ['Đen','Trắng'] and x['color_label'] in x['name'] for x in ps['products'])
call('/api/products','POST',p,a,409)
call('/api/products','POST',body(color=' đen '),a,409)
# New earlier row must roll back if a later row duplicates an existing combination.
call('/api/products/batch','POST',{'items':[{'product':body('500g','Xanh')},{'product':p}]},a,409)
assert len(call('/api/products?modelId='+model,token=a)['products'])==4
# Optional colour, custom colour, duplicate initials and size spelling collisions use safe suffixes.
for b in [body('330g',''),body('330g','Đỏ mận'),body('110','Đen')]:call('/api/products','POST',b,a)
ps=call('/api/products?modelId='+model,token=a)['products']
assert next(x for x in ps if x['size_label']=='110')['sku']=='NT-0001-WT-110-DEN-2'
# PUT without an explicit code remains invalid (do not silently rename existing SKU).
x=next(x for x in ps if x['color_label']=='Đỏ mận')
call('/api/products/'+x['id'],'PUT',body('330g','Xanh',sku=x['sku'],version=x['version']),a,204)
y=next(x for x in call('/api/products?modelId='+model,token=a)['products'] if x['color_label']=='Xanh')
assert y['sku']==x['sku'] and 'Xanh' in y['name']
# Model rename preserves colour in the derived display name.
m=next(x for x in call('/api/models?page=1&search=NT-0001',token=a)['items'] if x['id']==model)
call('/api/models/'+model,'PUT',{'code':m['code'],'name':'Nến đổi tên','categoryId':cat,'version':m['version']},a,204)
assert all(p['color_label'] in p['name'] for p in call('/api/products?modelId='+model,token=a)['products'] if p['color_label'])
# Export contains a real colour column and preserves Vietnamese labels.
raw=call('/api/transfers/products/export?search=NT-0001',token=a)
with zipfile.ZipFile(io.BytesIO(raw)) as z:
 xml=z.read('xl/worksheets/sheet1.xml').decode();assert 'Màu cốc' in xml and 'Trắng' in xml
# XLSX create/update/explicit clear preserve custom colours; auto-SKU may be blank.
pre=base['preview']('products',['SKU','Mã mẫu','Tên mùi','Size / quy cách','Màu cốc'],[['','NT-0001','White Tea','440g','Be']],actor=a)
assert pre['valid'],pre
base['commit']('products',pre,actor=a)
imported=next(x for x in call('/api/products?modelId='+model,token=a)['products'] if x['size_label']=='440g')
assert imported['color_label']=='Be' and imported['sku']=='NT-0001-WT-440-BE'
pre=base['preview']('products',['ID','Phiên bản','Màu cốc'],[[imported['id'],imported['version'],'[XÓA]']],mode='update',actor=a)
assert pre['valid'],pre
base['commit']('products',pre,actor=a)
cleared=next(x for x in call('/api/products?modelId='+model,token=a)['products'] if x['id']==imported['id'])
assert cleared['color_label']=='' and cleared['sku']==imported['sku']
# A bad retail price rejects the entire batch, including all earlier products.
call('/api/products/batch','POST',{'items':[{'product':body('700g','Đen')},{'product':body('700g','Trắng'),'retail':{'channel':'retail','unitPrice':-1,'commissionRate':0,'minQty':1}}]},a,400)
assert not any(x['size_label']=='700g' for x in call('/api/products?modelId='+model,token=a)['products'])
# Snapshot document stores colour as part of product_name.
quote=call('/api/quotes','POST',{'customerId':base['cu1'],'channel':'retail','validUntil':'2099-12-31','discount':0,'shipping':0,'note':'','lines':[{'productId':batch['items'][0]['id'],'qty':1}]},a)
q=call('/api/quotes/'+quote['id'],token=a)
assert 'Đen' in q['lines'][0]['product_name'] and '110g' in q['lines'][0]['product_name']
# Permission guard on all new endpoints.
ctv=base['change']('ctv1@test.amora','Another-temporary-password','CTV-new-private-password')
for path,method,payload in [('/api/products/variant-options','GET',None),('/api/products/sku-preview','POST',p),('/api/products/batch','POST',{'items':items})]:call(path,method,payload,ctv,403)
# Fresh backup includes the new colour field and schema marker.
backup=call('/api/admin/backup',token=a)
assert backup['schema']==sorted((Path(__file__).parents[1]/'database/migrations').glob('*.sql'))[-1].name
assert any(x.get('color_label')=='Trắng' for x in backup['tables']['products'])
Path(__file__).parents[1].joinpath('colour-test-backup.json').write_text(json.dumps(backup))
print('PASS: colour variants, exact generated SKUs, duplicate protection, batch rollback, custom colours, stable existing codes, model rename, XLSX colour, snapshots, permissions and backup.')
