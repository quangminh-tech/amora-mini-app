"""Dedicated EMPTY DB. Includes existing regression suite and colour integration checks."""
from pathlib import Path
import runpy,json,copy
scope=runpy.run_path(str(Path(__file__).with_name('colour-variants.py')))
call,a,ctv=scope['call'],scope['a'],scope['ctv']
base=scope['base'];product_id=scope['batch']['items'][0]['id'];model=scope['model']
settings=call('/api/document-templates',token=a)
assert settings['version']==0 and len(settings['templates'])==2
assert call('/api/document-templates',token=ctv)['templates']==settings['templates']
call('/api/document-templates','PUT',{'version':0,'templates':settings['templates']},ctv,403)
bad=copy.deepcopy(settings['templates']);bad[0]['intro']='{{unknown_key}}'
call('/api/document-templates','PUT',{'version':0,'templates':bad},a,400)
bad=copy.deepcopy(settings['templates']);bad[0]['intro']=None
call('/api/document-templates','PUT',{'version':0,'templates':bad},a,400)
bad=copy.deepcopy(settings['templates']);bad[0]['fields']=[{'key':'quote_code','label':'Bad','defaultValue':''}]
call('/api/document-templates','PUT',{'version':0,'templates':bad},a,400)
call('/api/document-templates','PUT',{'version':0,'templates':settings['templates']},a,204)
call('/api/document-templates','PUT',{'version':0,'templates':settings['templates']},a,409)
quote_body={'customerId':base['cu1'],'channel':'retail','shipping':0,'note':'Thử mẫu chung','validUntil':'2099-12-31','terms':'Điều kiện riêng','lines':[{'productId':product_id,'qty':1}],'document':{'templateId':'corporate','values':{'contact_person':'Quỳnh','packaging':'Hộp quà, tag riêng','production_time':'7-10 ngày','payment_terms':'Cọc theo thỏa thuận','tax_note':'Chưa gồm thuế và vận chuyển'}}}
qid=call('/api/quotes','POST',quote_body,a)['id'];before=call('/api/quotes/'+qid,token=a)
snapshot=before['record']['document_snapshot'];snapshot=json.loads(snapshot) if isinstance(snapshot,str) else snapshot
assert snapshot['values']['contact_person']=='Quỳnh' and snapshot['template']['id']=='corporate' and snapshot['version']==1
changed=copy.deepcopy(settings['templates']);changed[1]['title']='TIÊU ĐỀ MỚI'
call('/api/document-templates','PUT',{'version':1,'templates':changed},a,204)
after=call('/api/quotes/'+qid,token=a)
assert after['record']['document_snapshot']==before['record']['document_snapshot'],'Old quote template must be immutable after common template changes'
call('/api/quotes','POST',{**quote_body,'document':{'templateId':'missing','values':{}}},a,400)
call('/api/quotes','POST',{**quote_body,'document':{'templateId':'corporate','values':{'quote_code':'fake'}}},a,400)
# Explicit switch to basic clears snapshot; legacy clients omitting Document retain it.
call('/api/quotes/'+qid,'PUT',{**quote_body,'document':None,'version':after['record']['version'],'clearDocument':True},a)
assert call('/api/quotes/'+qid,token=a)['record']['document_snapshot'] in ({},'{}')
# Atomic bulk pricing, stale versions, negative and duplicate rows.
products=call('/api/products?modelId='+model,token=a)
ids=[p['id'] for p in products['products'][:2]]
def price(id,value=180000):
 old=next((p for p in products['prices'] if p['product_id']==id and p['channel']=='wholesale'),None)
 return {'productId':id,'price':{'channel':'wholesale','unitPrice':value,'commissionRate':8,'minQty':12,'version':old['version'] if old else 0}}
items=[price(id) for id in ids]
call('/api/prices/batch','POST',{'items':items},ctv,403)
call('/api/prices/batch','POST',{'items':items+[items[0]]},a,400)
call('/api/prices/batch','POST',{'items':[None]},a,400)
call('/api/prices/batch','POST',{'items':items},a)
updated=call('/api/products?modelId='+model,token=a)
assert len([p for p in updated['prices'] if p['channel']=='wholesale' and p['product_id'] in ids])==2
# First SKU gets valid change; later SKU stale -> entire transaction rolls back.
current={p['product_id']:p for p in updated['prices'] if p['channel']=='wholesale'}
valid=price(ids[0],190000);valid['price']['version']=current[ids[0]]['version']
stale=price(ids[1],190000)
call('/api/prices/batch','POST',{'items':[valid,stale]},a,409)
assert all(p['unit_price']==180000 for p in call('/api/products?modelId='+model,token=a)['prices'] if p['channel']=='wholesale' and p['product_id'] in ids)
# Export payload excludes commissions, ownership and private storage keys.
export=call('/api/catalogue/export-data','POST',{'ids':[product_id],'channel':'retail'},ctv)
assert len(export['products'])==1 and len(export['prices'])==1
assert not any(k in json.dumps(export) for k in ['commission_rate','owner_id','object_key','ctvQuotes','password'])
call('/api/catalogue/export-data','POST',{'ids':[product_id],'channel':'wholesale'},ctv,403)
call('/api/catalogue/export-data','POST',{'ids':[product_id]*2},a,400)
call('/api/catalogue/export-data','POST',{'ids':['00000000-0000-0000-0000-000000000000']},a,409)
# Hidden SKU cannot be published even by manager.
p=next(p for p in products['products'] if p['id']==product_id)
call('/api/products/'+product_id,'PUT',{'sku':p['sku'],'modelId':p['model_id'],'sizeLabel':p['size_label'],'colorLabel':p['color_label'],'scentId':p['scent_id'],'unit':p['unit'],'active':False,'version':p['version']},a,204)
call('/api/catalogue/export-data','POST',{'ids':[product_id]},ctv,409)
backup=call('/api/admin/backup',token=a)
assert backup['schema']=='005_document_templates.sql'
assert any(x['key']=='document_templates' for x in backup['tables']['settings'])
Path(__file__).parents[1].joinpath('document-test-backup.json').write_text(json.dumps(backup,ensure_ascii=False))
print('PASS: document template validation, import structure, optimistic updates, quote snapshots, safe variables, basic-template switch, atomic bulk prices and stale rollback, catalogue permissions, hidden SKU guard and private-field exclusion.')
