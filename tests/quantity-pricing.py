"""Quantity pricing regression. Dedicated EMPTY DB only; includes all earlier suites."""
from pathlib import Path
import runpy,copy,json,os
scope=runpy.run_path(str(Path(__file__).with_name('documents.py')))
call,a,ctv,base=scope['call'],scope['a'],scope['ctv'],scope['base']
category=call('/api/directories/product-categories','POST',{'code':'QTYTEST','name':'Nến cộng số lượng'},a)['id']
model=call('/api/models','POST',{'code':'QTY-TEST','name':'Mẫu kiểm tra bậc','categoryId':category},a)['id']
products=[]
for size in ['120g','220g']:
 p=call('/api/products','POST',{'sku':'','modelId':model,'sizeLabel':size,'colorLabel':'Trắng','unit':'hũ','active':True},a)['id'];products.append(p)
 call('/api/products/'+p+'/prices','PUT',{'channel':'retail','unitPrice':199000 if size=='120g' else 279000,'commissionRate':10,'minQty':1},a,204)
p1,p2=products
policy={'categoryId':category,'channel':'wholesale','name':'Sỉ nến hũ','active':True,'ctvAllowed':True,'minMargin':10,'version':0,'costs':[{'productId':p1,'unitCost':100000,'version':0},{'productId':p2,'unitCost':150000,'version':0}],'tiers':[{'minQty':10,'commissionRate':5,'prices':[{'productId':p1,'unitPrice':179000},{'productId':p2,'unitPrice':249000}]},{'minQty':30,'commissionRate':4,'prices':[{'productId':p1,'unitPrice':169000},{'productId':p2,'unitPrice':239000}]}]}
call('/api/pricing/editor?categoryId='+category+'&channel=wholesale',token=ctv,expected=403)
call('/api/pricing/policy','PUT',policy,ctv,403)
call('/api/pricing/policy','PUT',policy,a)
call('/api/products/'+p1+'/prices','PUT',{'channel':'wholesale','unitPrice':1000,'minQty':1,'commissionRate':0},a,409)
call('/api/catalogue/export-data','POST',{'ids':[p1],'channel':'wholesale'},a,409)
call('/api/pricing/policy','PUT',policy,a,409)
public=call('/api/pricing/policies',token=ctv)
assert any(p['category_id']==category for p in public['policies'])
assert not any(k in json.dumps(public) for k in ['unit_cost','min_margin'])
def preview(q1,q2=0,ch='wholesale',actor=ctv):
 return call('/api/pricing/preview','POST',{'channel':ch,'lines':[{'productId':p1,'qty':q1}]+([{'productId':p2,'qty':q2}] if q2 else [])},actor)
x=preview(4,5);assert not x['valid'] and 'thêm 1' in x['lines'][0]['error']
x=preview(4,6);assert x['valid'] and x['subtotal']==4*179000+6*249000 and all(l['groupQty']==10 for l in x['lines'])
x=preview(12,18);assert x['valid'] and x['lines'][0]['unitPrice']==169000 and x['lines'][1]['unitPrice']==239000 and x['commission']==round(12*169000*.04)+round(18*239000*.04)
assert not any(k in json.dumps(x) for k in ['unit_cost','unitCost','min_margin'])
preview(1,actor=a) # manager is subject to quantity rules too
call('/api/pricing/preview','POST',{'channel':'wholesale','lines':[{'productId':p1,'qty':10,'unitPrice':1}]},ctv,403)
call('/api/pricing/preview','POST',{'channel':'wholesale','lines':[{'productId':p1,'qty':10}]*2},ctv,400)
call('/api/pricing/preview','POST',{'channel':'wholesale','lines':[{'productId':p1,'qty':1.5}]},ctv,400)
call('/api/pricing/preview','POST',{'channel':'wholesale','lines':[None]},ctv,400)
# Unrelated group quantities never count towards the threshold.
other_cat=call('/api/directories/product-categories','POST',{'code':'NOTCANDLE','name':'Phụ kiện kiểm tra'},a)['id']
other_model=call('/api/models','POST',{'code':'OTHER-QTY','name':'Phụ kiện','categoryId':other_cat},a)['id']
other=call('/api/products','POST',{'sku':'','modelId':other_model,'sizeLabel':'1 cái','active':True},a)['id']
call('/api/products/'+other+'/prices','PUT',{'channel':'wholesale','unitPrice':10000,'commissionRate':0,'minQty':1},a,204)
y=call('/api/pricing/preview','POST',{'channel':'wholesale','lines':[{'productId':p1,'qty':1},{'productId':other,'qty':100}]},a)
assert not y['valid'] and y['lines'][0]['groupQty']==1 and y['lines'][1]['groupQty']==100
call('/api/pricing/preview','POST',{'channel':'wholesale','lines':[{'productId':p1,'qty':1},{'productId':other,'qty':100}]},ctv,403)
quote={'customerId':base['cu1'],'channel':'wholesale','shipping':50000,'note':'','validUntil':'2099-12-31','lines':[{'productId':p1,'qty':12},{'productId':p2,'qty':18}],'pricingToken':x['token']}
qid=call('/api/quotes','POST',quote,ctv)['id'];before=call('/api/quotes/'+qid,token=ctv)
assert before['record']['subtotal']==x['subtotal']
snap=before['record']['pricing_snapshot'];snap=json.loads(snap) if isinstance(snap,str) else snap
assert snap['lines'][0]['GroupQty']==30 and snap['lines'][0]['PolicyVersion']==1
# Policy edit is atomic; stale costs and low-margin prices reject everything.
editor=call('/api/pricing/editor?categoryId='+category+'&channel=wholesale',token=a)
updated={**copy.deepcopy(policy),'version':1,'costs':[]}
bad=copy.deepcopy(updated);bad['tiers'][0]['prices'][0]['unitPrice']=100000
call('/api/pricing/policy','PUT',bad,a,400)
bad=copy.deepcopy(updated);bad['tiers'][1]['minQty']=10
call('/api/pricing/policy','PUT',bad,a,400)
bad=copy.deepcopy(updated);bad['tiers'][0]['prices'][0]['productId']=other
call('/api/pricing/policy','PUT',bad,a,400)
bad=copy.deepcopy(updated);bad['costs']=policy['costs']
call('/api/pricing/policy','PUT',bad,a,409)
assert call('/api/pricing/editor?categoryId='+category+'&channel=wholesale',token=a)['policy']['version']==1
updated['tiers'][1]['prices'][0]['unitPrice']=170000
call('/api/pricing/policy','PUT',updated,a)
assert call('/api/quotes/'+qid,token=ctv)['record']['pricing_snapshot']==before['record']['pricing_snapshot']
call('/api/quotes','POST',quote,ctv,409)
# Snapshot survives quote->order conversion; actual commission remains tied to owner.
q=call('/api/quotes/'+qid,token=ctv)
call('/api/quotes/'+qid+'/status','POST',{'version':q['record']['version'],'status':'sent'},ctv,204)
q=call('/api/quotes/'+qid,token=ctv)
call('/api/quotes/'+qid+'/status','POST',{'version':q['record']['version'],'status':'accepted'},ctv,204)
q=call('/api/quotes/'+qid,token=ctv)
oid=call('/api/quotes/'+qid+'/convert','POST',{'version':q['record']['version']},ctv)['id'];o=call('/api/orders/'+oid,token=ctv)
assert o['record']['pricing_snapshot']==before['record']['pricing_snapshot'] and o['record']['commission_total']==x['commission']
# Removing a price does not fall through to a lower tier or legacy price.
updated['version']=2;updated['tiers'][1]['prices']=[v for v in updated['tiers'][1]['prices'] if v['productId']!=p2]
call('/api/pricing/policy','PUT',updated,a)
assert not preview(12,18)['valid']
# Disable CTV access while retaining manager policy. CTV cannot discover it.
updated['version']=3;updated['ctvAllowed']=False
call('/api/pricing/policy','PUT',updated,a)
preview(12,18,actor=ctv) if False else call('/api/pricing/preview','POST',{'channel':'wholesale','lines':[{'productId':p1,'qty':12}]},ctv,403)
assert not any(p['category_id']==category for p in call('/api/pricing/policies',token=ctv)['policies'])
# B2B uses an independent threshold.
b2b={**copy.deepcopy(policy),'version':0,'channel':'b2b','costs':[],'tiers':[{'minQty':20,'commissionRate':3,'prices':policy['tiers'][0]['prices']}]}
call('/api/pricing/policy','PUT',b2b,a)
assert not preview(9,10,'b2b')['valid'] and preview(10,10,'b2b')['valid']
# Costs remain unavailable from public catalogue and CTV report.
assert not any(k in json.dumps(call('/api/products?includeIds='+p1,token=ctv)) for k in ['unit_cost','unitCost'])
ov=call('/api/overview',token=ctv);assert 'completed' in ov['orders'] and not ov['team']
backup=call('/api/admin/backup',token=a)
assert backup['schema']=='006_quantity_pricing.sql' and len(backup['tables'])==23
assert len(backup['tables']['pricing_policies'])==2 and len(backup['tables']['product_costs'])==2
Path(os.getenv('TEST_BACKUP_PATH',str(Path(__file__).parents[1]/'quantity-test-backup.json'))).write_text(json.dumps(backup,ensure_ascii=False))
print('PASS: quantity boundaries, mixed SKUs, group isolation, tier precedence, missing-price blocking, CTV permissions, hidden costs, net margin, atomic rollback, stale policy/cost versions, preview token, immutable snapshots, conversion and 23-table backup.')
