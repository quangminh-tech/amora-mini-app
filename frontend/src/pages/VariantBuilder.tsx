import React, {useState} from 'react';
import {api, Row} from '../api';
import {Modal,Field,ErrorBox,useLoad,useDebounced} from '../components/UI';
type Draft={size:string;color:string;price:string;moq:string;rate:string};
const plain=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toUpperCase();
const slug=(v:string)=>plain(v).replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const expectedCode=(model:string,scent:string,size:string,color:string)=>[slug(model),(plain(scent).match(/[A-Z0-9]+/g)||[]).map(w=>w[0]).join('')||'KM',slug(size).replace(/^([0-9]+)G$/,'$1'),slug(color)].filter(Boolean).join('-');
const unique=(text:string)=>Array.from(new Set(text.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean)));
export function VariantBuilder({revision,refresh,tell,close}:{revision:number;refresh:()=>void;tell:(message:string)=>void;close:()=>void}){
 const [search,setSearch]=useState(''),[model,setModel]=useState(''),[scent,setScent]=useState(''),[sizes,setSizes]=useState('110g, 220g'),[colors,setColors]=useState('Đen, Trắng');
 const [unit,setUnit]=useState('lọ'),[min,setMin]=useState('7'),[max,setMax]=useState('10'),[rows,setRows]=useState<Draft[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const term=useDebounced(search);
 const {data:models,error:modelError}=useLoad<Row>(`/models?page=1&pageSize=100&search=${encodeURIComponent(term)}`,revision);
 const {data:scents,error:scentError}=useLoad<Row[]>('/scents',revision);
 const selected=models?.items.find((x:Row)=>x.id===model);
 function generate(){setError('');const ss=unique(sizes),cc=unique(colors);if(!model||!ss.length){setError('Chọn mẫu và nhập ít nhất một size.');return}const colourList=cc.length?cc:[''];if(ss.length*colourList.length>100){setError('Mỗi lần tạo tối đa 100 phiên bản.');return}setRows(ss.flatMap(size=>colourList.map(color=>({size,color,price:'',moq:'1',rate:'0'}))))}
 function update(index:number,key:keyof Draft,value:string){setRows(old=>old.map((r,i)=>i===index?{...r,[key]:value}:r))}
 async function save(){setBusy(true);setError('');try{
   const result=await api('/products/batch','POST',{items:rows.map(row=>({product:{sku:'',modelId:model,scentId:scent||null,sizeLabel:row.size,colorLabel:row.color,unit,description:'',active:true,leadDaysMin:Number(min),leadDaysMax:Number(max)},retail:row.price===''?null:{channel:'retail',unitPrice:Number(row.price),commissionRate:Number(row.rate),minQty:Number(row.moq),version:0}}))});
   refresh();tell(`Đã tạo ${result.count} SKU. Mã chính thức hiển thị trong danh sách.`);close();
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <Modal title="Tạo nhiều size / màu" close={()=>{if(!busy)close()}}><form onSubmit={e=>{e.preventDefault();if(rows.length)void save();else generate()}}>
 <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
 <Field label="Mẫu sản phẩm"><input placeholder="Tìm mã hoặc tên mẫu…" value={search} onChange={e=>setSearch(e.target.value)}/><select required value={model} onChange={e=>{setModel(e.target.value);setRows([])}}><option value="">Chọn mẫu</option>{model&&!selected&&<option value={model}>Mẫu đã chọn</option>}{models?.items.filter((m:Row)=>m.active).map((m:Row)=><option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select></Field>
 <Field label="Mùi hương"><select value={scent} onChange={e=>{setScent(e.target.value);setRows([])}}><option value="">Không gắn mùi</option>{scents?.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
 <div className="form-grid"><Field label="Các size, cách nhau bằng dấu phẩy"><input required value={sizes} onChange={e=>{setSizes(e.target.value);setRows([])}} placeholder="110g, 220g"/></Field><Field label="Các màu, cách nhau bằng dấu phẩy"><input value={colors} onChange={e=>{setColors(e.target.value);setRows([])}} placeholder="Đen, Trắng (để trống nếu không phân màu)"/></Field><Field label="Đơn vị bán"><input required maxLength={30} value={unit} onChange={e=>setUnit(e.target.value)}/></Field><Field label="Chuẩn bị tối thiểu (ngày)"><input type="number" required min={0} max={365} value={min} onChange={e=>setMin(e.target.value)}/></Field><Field label="Chuẩn bị tối đa (ngày)"><input type="number" required min={Number(min)} max={365} value={max} onChange={e=>setMax(e.target.value)}/></Field></div>
 <button type="button" className="secondary" onClick={generate}>Tạo bảng phiên bản</button>
 {rows.length>0&&<><p className="muted">{rows.length} phiên bản · SKU dưới đây là dự kiến; máy chủ cấp mã chính thức khi lưu. Giá để trống: lưu SKU chưa có giá. Toàn bộ bảng được lưu cùng lúc; nếu có dòng trùng thì chưa lưu dòng nào.</p><div className="table-wrap"><table><thead><tr><th>SKU dự kiến</th><th>Size</th><th>Màu cốc</th><th>Giá lẻ (đ)</th><th>MOQ</th><th>Hoa hồng %</th><th/></tr></thead><tbody>{rows.map((row,i)=><tr key={row.size+'|'+row.color}><td className="code">{selected?expectedCode(selected.code,scents?.find(s=>s.id===scent)?.name||'',row.size,row.color):'Tự cấp khi lưu'}</td><td>{row.size}</td><td>{row.color||'Không phân màu'}</td><td><input aria-label={'Giá '+row.size+' '+row.color} type="number" min={1} max={1000000000} step={1} value={row.price} onChange={e=>update(i,'price',e.target.value)}/></td><td><input aria-label={'MOQ '+(i+1)} type="number" min={1} max={100000} required={row.price!==''} value={row.moq} onChange={e=>update(i,'moq',e.target.value)}/></td><td><input aria-label={'Hoa hồng '+(i+1)} type="number" min={0} max={100} step="0.01" required={row.price!==''} value={row.rate} onChange={e=>update(i,'rate',e.target.value)}/></td><td><button type="button" className="ghost danger" onClick={()=>setRows(old=>old.filter((_,j)=>i!==j))}>Bỏ dòng</button></td></tr>)}</tbody></table></div></>}
 <ErrorBox error={error||modelError||scentError}/><div className="form-actions"><button type="button" className="secondary" onClick={close}>Hủy</button><button className="primary" disabled={!rows.length}>Lưu {rows.length||''} SKU</button></div>
 </fieldset></form></Modal>
}
