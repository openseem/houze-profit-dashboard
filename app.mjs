import {initAnalytics} from './analytics.mjs';
import {DATA} from './data.mjs';
import {COSTS,normalize,filterRows,metrics,aggregate,sortGroups} from './core.mjs';

const rows=normalize(DATA.rows);
const analytics=initAnalytics();
const startDate=DATA.dates[0],endDate=DATA.dates.at(-1);
const el=id=>document.getElementById(id);
const icon=name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(c,sign=false)=>c==null?'—':(sign&&c>0?'+':'')+new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(c/100);
const amount=c=>`¥${money(c)}`;
const percent=x=>x==null?'不适用':(x*100).toFixed(2)+'%';
const count=n=>new Intl.NumberFormat('zh-CN').format(n);
const profitClass=n=>n<0?'loss-number':n>0?'profit-number':'neutral-number';
const state={view:'day',sort:'date',direction:'asc',page:1,pageSize:1000,start:startDate,end:endDate,product:'',query:'',status:'all',profit:'all'};
let filtered=[],groups=[],total=metrics([]),toastTimer;
const productOptions=[...new Map(rows.map(r=>[r.goods_id,r])).values()].sort((a,b)=>a.code.localeCompare(b.code));
el('productFilter').insertAdjacentHTML('beforeend',productOptions.map(p=>`<option value="${esc(p.goods_id)}">${esc(p.code)} · ${esc(p.goods_id==='1018651466560'?'补差价收入':p.name)}</option>`).join(''));

function toast(message){el('toast').textContent=message;el('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el('toast').classList.remove('show'),2400);}
function showMethod(){el('methodDialog').showModal();}
function reset(){Object.assign(state,{start:startDate,end:endDate,product:'',query:'',status:'all',profit:'all',page:1});syncFilters();render();}
function syncFilters(){
  el('startDate').value=state.start;el('endDate').value=state.end;el('searchInput').value=state.query;el('productFilter').value=state.product;el('statusFilter').value=state.status;el('profitFilter').value=state.profit;
  document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('selected',b.dataset.preset==='all'?state.start===startDate&&state.end===endDate:state.start===b.dataset.preset&&state.end===b.dataset.preset));
}
function setView(view){state.view=view;state.page=1;state.sort=view==='day'?'date':view==='product'?'profit':'date';state.direction=view==='product'?'desc':'asc';render();}
function render(){
  filtered=state.start>state.end?[]:filterRows(rows,state);total=metrics(filtered);groups=sortGroups(aggregate(filtered,state.view),state.sort,state.direction);
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-pressed',String(b.dataset.view===state.view));});
  const days=new Set(filtered.map(r=>r.date)).size,products=new Set(filtered.map(r=>r.goods_id)).size;
  el('scopeText').innerHTML=state.start>state.end?'开始日期晚于结束日期，请调整筛选范围。':`${esc(state.start.replaceAll('-','.'))} — ${esc(state.end.replaceAll('-','.'))}<span class="scope-separator">　·　</span><strong>${days} 天 / ${products} 个商品 / ${count(total.orders)} 笔成交 / ${total.expenses} 笔独立费用</strong>`;
  el('clearDrill').hidden=!(state.product||state.start!==startDate||state.end!==endDate||state.query||state.status!=='all'||state.profit!=='all');
  renderKpis();renderCharts();renderTable();analytics.update(filtered,state);
}
function renderKpis(){
  const cards=[
    {label:'退款后收入',code:'NET REVENUE',value:money(total.net),foot:`净售实物 <b>${count(total.units)}</b> 件`,currency:true},
    {label:'总成本与费用',code:'TOTAL COST',value:money(total.totalCost),foot:`货品、推广及其他 <b>7</b> 项费用`,currency:true},
    {label:'预计利润',code:'EST. PROFIT',value:money(total.profit),foot:`${total.pending?`含 <b>${total.pending}</b> 单待发货费用预留`:'已计入实际及预留费用'}`,currency:true,profit:true},
    {label:'预计利润率',code:'PROFIT MARGIN',value:total.margin==null?'—':percent(total.margin),foot:'预计利润 ÷ 退款后收入',currency:false}
  ];
  el('kpis').innerHTML=cards.map(c=>`<article class="kpi ${c.profit?'profit':''}"><div class="kpi-label"><span>${c.label}</span><span class="kpi-code">${c.code}</span></div><strong class="kpi-value ${c.profit&&total.profit<0?'negative':''}">${c.currency?'<span class="currency">¥</span>':''}${c.value}</strong><div class="kpi-foot">${c.foot}</div></article>`).join('');
}
function renderCharts(){
  const days=sortGroups(aggregate(filtered,'day'),'date','desc');
  const max=Math.max(...days.map(d=>Math.abs(d.profit)),1);
  el('profitChart').innerHTML=days.length?days.map(d=>`<button class="trend-item" data-action="day" data-key="${esc(d.key)}" aria-label="查看${d.date}商品利润"><span class="trend-date">${d.date.slice(5).replace('-',' / ')}<small>${d.orders} 笔成交</small></span><span class="bar-track"><span class="bar-fill ${d.profit<0?'loss':''}" style="width:${Math.max(1,Math.abs(d.profit)/max*95)}%"></span></span><span class="trend-amount ${profitClass(d.profit)}">${amount(d.profit)}<small>利润率 ${percent(d.margin)}</small></span></button>`).join('')+'<div class="chart-caption">按成交日期归属 · 订单退款状态截至 11 月 4 日</div>':'<div class="empty-state"><strong>当前筛选下没有数据</strong><p>调整日期或清除其他筛选条件。</p></div>';
  el('costCaption').textContent=`合计 ${amount(total.totalCost)} · 含预留费用`;
  el('costChart').innerHTML=`<div class="stacked-bar" aria-label="成本占比">${COSTS.filter(([k])=>total[k]>0).map(([k,label,color])=>`<span title="${label} ${amount(total[k])}" style="width:${total.totalCost?total[k]/total.totalCost*100:0}%;background:${color}"></span>`).join('')}</div><div class="cost-legend">${COSTS.map(([k,label,color])=>`<div class="cost-item"><i style="background:${color}"></i><span>${label}</span><strong>${money(total[k])}<small>${total.totalCost?(total[k]/total.totalCost*100).toFixed(1):'0.0'}%</small></strong></div>`).join('')}</div>`;
}
const columns={
  day:[['date','成交日期'],['orders','成交单数',1],['refunds','退款单数',1],['units','净售件数',1],['net','退款后收入',1],['totalCost','总成本',1],['profit','预计利润',1],['margin','利润率',1],['action','查看',0]],
  product:[['name','商品'],['units','净售件数',1],['purchaseUnit','单件采购成本',1],['net','退款后收入',1],['totalCost','总成本',1],['unitProfit','平均单件利润',1],['profit','预计利润',1],['margin','利润率',1],['action','查看']],
  order:[['key','订单'],['name','商品'],['status','状态'],['net','退款后收入',1],['cost','货品成本',1],['ad','推广费分摊',1],['totalCost','总成本',1],['profit','预计利润',1],['action','明细']]
};
function productCell(g,compact=false){
  return `<div class="product-cell">${compact?'':`<span class="product-avatar">${esc(g.code)}</span>`}<div><div class="product-title" title="${esc(g.name)}">${esc(g.name)}</div><div class="product-meta">${esc(g.code)} · ${esc(g.goods_id)}</div>${g.order?`<div class="item-spec" title="${esc(g.order.spec)}">${esc(g.order.spec)} · ${g.order.qty} 件</div>`:''}</div></div>`;
}
function statusBadge(order){const cls=order.refund_flag?'refund':order.status==='待发货'?'pending':'normal';return `<span class="status ${cls}">${esc(order.status)}</span>`;}
function cell(g,key){
  if(key==='date')return `<span class="date-label">${esc(g.date)}${g.date===endDate?'<span class="date-tag">部分数据</span>':''}</span>`;
  if(key==='key')return `<button class="order-id" data-action="order" data-key="${esc(g.key)}">${esc(g.key)}</button><div class="order-date">${esc(g.order.time)}</div>`;
  if(key==='name')return productCell(g,state.view==='order');
  if(key==='status')return statusBadge(g.order);
  if(key==='action')return `<button class="table-link" data-action="${state.view==='day'?'day':state.view==='product'?'product':'order'}" data-key="${esc(g.key)}">${state.view==='day'?'看商品':state.view==='product'?'看订单':'展开'} ${icon('arrow')}</button>`;
  if(['orders','refunds','units'].includes(key))return count(g[key]);
  if(key==='margin')return `<span class="${profitClass(g.profit)}">${percent(g.margin)}</span>`;
  if(['profit','unitProfit'].includes(key))return `<span class="${profitClass(g[key]??0)}">${money(g[key])}</span>`;
  return money(g[key]);
}
function renderTable(){
  const c=columns[state.view];
  const titles={day:['每日利润明细','点击“看商品”逐层查看该日经营结果。'],product:['商品利润明细','单件采购成本仅货品进价；单件利润已扣分摊费用。'],order:['订单及独立费用明细','含无成交推广费用记录；独立费用不计入成交单数。']};
  el('tableTitle').textContent=titles[state.view][0];el('tableSubtitle').textContent=titles[state.view][1];
  el('tableHead').innerHTML='<tr>'+c.map(([key,label,n])=>`<th class="${n?'number':''}">${['action','status'].includes(key)?label:`<button data-sort="${key}" class="${state.sort===key?'sorted':''}" aria-label="按${label}排序">${label}${icon('sort')}</button>`}</th>`).join('')+'</tr>';
  const pages=Math.max(1,Math.ceil(groups.length/state.pageSize));state.page=Math.min(state.page,pages);
  const current=groups.slice((state.page-1)*state.pageSize,state.page*state.pageSize);
  el('tableBody').innerHTML=current.length?current.map(g=>`<tr>${c.map(([key,,n])=>`<td class="${n?'number':''} ${key==='date'?'strong':''}">${cell(g,key)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${c.length}" class="empty-state"><strong>没有符合条件的记录</strong><p>尝试清空搜索或点击“重置”。</p></td></tr>`;
  const foots=state.view==='day'?['筛选合计',count(total.orders),count(total.refunds),count(total.units),money(total.net),money(total.totalCost),money(total.profit),percent(total.margin),'']:state.view==='product'?['筛选合计',count(total.units),'—',money(total.net),money(total.totalCost),'—',money(total.profit),percent(total.margin),'']:['筛选合计',`${count(total.orders)} 笔订单`,'',money(total.net),money(total.cost),money(total.ad),money(total.totalCost),money(total.profit),''];
  el('tableFoot').innerHTML=groups.length?'<tr>'+foots.map((f,i)=>`<td class="${c[i][2]?'number':''}">${f}</td>`).join('')+'</tr>':'';
  const unit=state.view==='day'?'天':state.view==='product'?'个商品':'条订单及费用记录';
  el('resultCount').textContent=`共 ${count(groups.length)} ${unit}${pages>1?`，显示 ${(state.page-1)*state.pageSize+1}—${Math.min(state.page*state.pageSize,groups.length)}`:''} · 金额单位：元`;
  const visiblePages=[...new Set([1,state.page-1,state.page,state.page+1,pages])].filter(p=>p>=1&&p<=pages).sort((a,b)=>a-b);
  el('pagination').innerHTML=pages>1?`<button data-page="${state.page-1}" ${state.page===1?'disabled':''} aria-label="上一页">‹</button>`+visiblePages.map((p,i)=>`${i&&p-visiblePages[i-1]>1?'<span class="dots">…</span>':''}<button data-page="${p}" class="${p===state.page?'active':''}" aria-label="第${p}页">${p}</button>`).join('')+`<button data-page="${state.page+1}" ${state.page===pages?'disabled':''} aria-label="下一页">›</button>`:'';
}
function openOrder(orderId){
  const r=rows.find(r=>r.order===orderId);if(!r)return;
  const fee=(label,value,description='',total=false)=>`<div class="fee-line ${total?'total':''}"><span>${label}${description?`<small>${esc(description)}</small>`:''}</span><strong>${value}</strong></div>`;
  const costs=COSTS.map(([k,label])=>{
    let description='';if(k==='ad')description=r.ad_basis||'先归属商品，再按商品同日净收入分摊';if(k==='freight')description=r.freight_basis;if(k==='insurance')description=r.insurance_basis;if(k==='package')description=`${r.qty} 件 × ${amount(r.pack_unit)}，已含人工场地`;if(k==='cost')description=`采购单价 ${amount(r.unit)} · ${r.match}`;if(k==='platform')description='按当天退款后收入0.6%预估并分配';if(k==='tax')description='按当天退款后收入1%预留并分配';
    return fee(label,(r[k]?'−':'')+amount(r[k]),description);
  }).join('');
  el('orderDetails').innerHTML=`<div class="drawer-content"><div class="drawer-order"><div class="drawer-order-top"><span class="order-id">${esc(r.order)}</span><button class="icon-button" id="copyOrder" aria-label="复制订单号">${icon('copy')}</button></div><p>${esc(r.name)}</p><small>${esc(r.code)} · ${esc(r.spec)} · ${r.qty} 件<br>${esc(r.time)}</small><div style="margin-top:10px">${statusBadge(r)}</div></div><div class="drawer-section-title">收入</div>${fee('商家实收',amount(r.gross))}${fee('退款金额',(r.refund?'−':'')+amount(r.refund),r.refund_flag?'成功退款暂按全额退款':'')}${fee('退款后收入',amount(r.net),'',true)}<div class="drawer-section-title">成本与费用</div>${costs}${r.recovered_cost?fee('已恢复货品成本','+'+amount(r.recovered_cost),'完好退货入库；已在净货品成本中抵减'):''}${fee('总成本与费用',amount(r.totalCost),'',true)}<div class="drawer-profit"><div><span>预计利润</span><small>利润率 ${percent(r.net?r.profit/r.net:null)}</small></div><strong class="${profitClass(r.profit)}">${amount(r.profit)}</strong></div>${r.note?`<div class="drawer-warning">${esc(r.note)}</div>`:''}<div class="drawer-warning">逐单推广为估算分摊；手续费、税费及待出账费用仍需后续校准。</div></div>`;
  el('orderDialog').showModal();
  el('copyOrder').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(r.order);toast('订单号已复制');}catch{toast('复制未完成，请选中订单号手动复制');}});
}
function drill(action,key){
  if(action==='order'){openOrder(key);return;}
  if(action==='day'){state.start=key;state.end=key;syncFilters();setView('product');}
  if(action==='product'){state.product=key;syncFilters();setView('order');}
  el('tableTitle').scrollIntoView({behavior:'smooth',block:'center'});
}
function csvCell(value){if(value==null)return '';let s=String(value);if(typeof value==='string'&&/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function exportCsv(){
  if(!groups.length){toast('当前筛选没有可导出的记录');return;}
  const baseHeaders=['成交单数','退款单数','净售件数','商家实收','退款金额暂估','退款后收入','货品成本','包材及人工','运费','运费险','推广费','手续费预估','税费预留','总成本','预计利润','利润率(%)'];
  const baseValues=g=>[g.orders,g.refunds,g.units,...['gross','refund','net','cost','package','freight','insurance','ad','platform','tax','totalCost','profit'].map(k=>(g[k]/100).toFixed(2)),g.margin==null?'':(g.margin*100).toFixed(4)];
  let headers,values;
  if(state.view==='day'){headers=['成交日期',...baseHeaders];values=groups.map(g=>[g.date,...baseValues(g)]);}
  else if(state.view==='product'){headers=['商品ID','货号','商品名称','单件采购成本','平均单件利润',...baseHeaders];values=groups.map(g=>[g.goods_id,g.code,g.name,g.purchaseUnit==null?'':(g.purchaseUnit/100).toFixed(2),g.unitProfit==null?'':(g.unitProfit/100).toFixed(2),...baseValues(g)]);}
  else {headers=['订单号','成交日期','成交时间','商品ID','货号','商品名称','规格','订单状态','售后状态','商品件数','单件采购成本','运费依据','运费险依据',...baseHeaders];values=groups.map(g=>[g.order.order,g.date,g.order.time,g.goods_id,g.code,g.name,g.order.spec,g.order.status,g.order.aftersale,g.order.qty,(g.order.unit/100).toFixed(2),g.order.freight_basis,g.order.insurance_basis,...baseValues(g)]);}
  const csv='\uFEFF'+[headers,...values].map(r=>r.map(csvCell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`厚泽利润_${state.start}至${state.end}_${{day:'按天',product:'按商品',order:'按订单'}[state.view]}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`已导出 ${groups.length} 条${{day:'日期',product:'商品',order:'订单'}[state.view]}记录`);
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{const day=b.dataset.preset;state.start=day==='all'?startDate:day;state.end=day==='all'?endDate:day;state.page=1;syncFilters();render();}));
for(const [id,key] of [['startDate','start'],['endDate','end'],['productFilter','product'],['statusFilter','status'],['profitFilter','profit']])el(id).addEventListener('change',()=>{state[key]=el(id).value;state.page=1;syncFilters();render();});
el('searchInput').addEventListener('input',()=>{state.query=el('searchInput').value;state.page=1;render();});
el('resetButton').addEventListener('click',reset);el('clearDrill').addEventListener('click',reset);
el('tableHead').addEventListener('click',e=>{const b=e.target.closest('[data-sort]');if(!b)return;const key=b.dataset.sort;if(state.sort===key)state.direction=state.direction==='asc'?'desc':'asc';else{state.sort=key;state.direction=['name','key','date'].includes(key)?'asc':'desc';}state.page=1;renderTableSorted();});
function renderTableSorted(){groups=sortGroups(aggregate(filtered,state.view),state.sort,state.direction);renderTable();}
el('tableBody').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)drill(b.dataset.action,b.dataset.key);});
el('profitChart').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)drill(b.dataset.action,b.dataset.key);});
el('pagination').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b&&!b.disabled){state.page=Number(b.dataset.page);renderTable();}});
for(const id of ['methodSidebar','methodCost','methodFooter'])el(id).addEventListener('click',showMethod);
document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
for(const id of ['methodDialog','orderDialog'])el(id).addEventListener('click',e=>{if(e.target===el(id)){const b=el(id).getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)el(id).close();}});
el('exportButton').addEventListener('click',exportCsv);
el('pageSizeSelect').addEventListener('change',()=>{state.pageSize=Number(el('pageSizeSelect').value);state.page=1;renderTable();});
syncFilters();render();

document.querySelectorAll('input[type=date]').forEach(e=>{e.min=startDate;e.max=endDate;});
