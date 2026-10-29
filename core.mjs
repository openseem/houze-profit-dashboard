export const COSTS = [
  ['cost','货品成本','#334e68'],['ad','推广花费','#497cf3'],['freight','发货运费','#34a69a'],
  ['package','包材与人工场地','#a68bf0'],['insurance','运费险','#e3ad61'],['platform','平台手续费','#7d91a9'],['tax','税费预留','#c2cad5']
];
export const toCents = n => Math.round(Number(n) * 100);
export function normalize(rows) {
  const currency=['gross','refund','net','unit','pack_unit','cost','recovered_cost','package','insurance','freight','ad','platform','tax','profit'];
  return rows.map(r=>{
    const x={...r};currency.forEach(k=>x[k]=toCents(r[k]));
    x.totalCost=COSTS.reduce((s,[k])=>s+x[k],0);
    if(x.net-x.totalCost!==x.profit)throw new Error('订单收支不平：'+x.order);
    return x;
  });
}
export function filterRows(rows,f={}) {
  const query=(f.query||'').trim().toLowerCase();
  return rows.filter(r=>{
    if(f.start&&r.date<f.start||f.end&&r.date>f.end)return false;
    if(f.product&&r.goods_id!==f.product)return false;
    if(query&&![r.order,r.goods_id,r.code,r.name,r.spec].join(' ').toLowerCase().includes(query))return false;
    if(f.status==='refund'&&!r.refund_flag)return false;
    if(f.status==='active'&&(r.refund_flag||r.record_type==='expense'))return false;
    if(f.status==='expense'&&r.record_type!=='expense')return false;
    if(f.status==='pending'&&r.status!=='待发货')return false;
    if(f.profit==='positive'&&r.profit<=0||f.profit==='negative'&&r.profit>=0||f.profit==='zero'&&r.profit!==0)return false;
    return true;
  });
}
export function metrics(rows) {
  const m={rows,orders:rows.filter(r=>r.record_type!=='expense').length,expenses:rows.filter(r=>r.record_type==='expense').length,refunds:0,units:0,gross:0,refund:0,net:0,totalCost:0,profit:0,cost:0,ad:0,freight:0,package:0,insurance:0,platform:0,tax:0,pending:0};
  rows.forEach(r=>{
    for(const key of ['gross','refund','net','totalCost','profit',...COSTS.map(c=>c[0])])m[key]+=r[key];
    m.refunds+=r.refund_flag;m.units+=r.net_units;m.pending+=r.status==='待发货'?1:0;
  });
  m.margin=m.net?m.profit/m.net:null;
  m.unitProfit=m.units?m.profit/m.units:null;
  m.netOrders=m.orders-m.refunds;
  m.purchaseUnit=rows.some(r=>r.goods_id==='1018651466560')&&rows.every(r=>r.goods_id==='1018651466560')?null:(m.units?m.cost/m.units:(rows[0]?.unit??null));
  return m;
}
export function aggregate(rows,view='day') {
  if(view==='order')return rows.map(r=>({...metrics([r]),key:r.order,date:r.date,name:r.name,code:r.code,goods_id:r.goods_id,order:r}));
  const groups=new Map();
  rows.forEach(r=>{const key=view==='day'?r.date:r.goods_id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);});
  return [...groups].map(([key,rr])=>({...metrics(rr),key,date:view==='day'?key:null,name:rr[0].name,code:rr[0].code,goods_id:rr[0].goods_id}));
}
export function sortGroups(groups,key,direction='desc') {
  const dir=direction==='asc'?1:-1;
  return [...groups].sort((a,b)=>{
    const x=a[key],y=b[key];if(x==null)return 1;if(y==null)return -1;
    return (typeof x==='string'?x.localeCompare(String(y),'zh-CN'):x-y)*dir||String(a.key).localeCompare(String(b.key));
  });
}
