import {ANALYTICS} from './analytics-data.mjs';
import {decodeAnalytics,dailyStats,analysisTotals,cohortRows,bandStats,caseStats} from './analytics-core.mjs';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(x);
const cash=x=>x==null?'—':'¥'+new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(x/100);
const pct=x=>x==null?'—':(x*100).toFixed(2)+'%';
const colors={teal:'#218f83',blue:'#507bb8',orange:'#bc7f55',purple:'#8073ac'};
const card=(title,value,note)=>`<div class="a-stat"><span>${title}</span><strong>${value}</strong><small>${note}</small></div>`;
function legend(items){return `<div class="a-legend">${items.map(s=>`<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div>`;}
function niceMax(v){if(!v)return 1;const p=10**Math.floor(Math.log10(v)),f=v/p;return [1,1.5,2,2.5,3,4,5,6,8,10].find(n=>n>=f)*p;}
function tipEvents(host,data,body){
 const tip=host.querySelector('.a-tooltip');
 const show=e=>{const hit=e.target.closest('[data-point]');if(!hit)return;const item=data[Number(hit.dataset.point)];if(!item)return;tip.innerHTML=body(item);tip.hidden=false;const r=host.getBoundingClientRect(),b=hit.getBoundingClientRect();let x=e.clientX??b.x+b.width/2,y=e.clientY??b.y+b.height/2;tip.style.left=Math.max(0,Math.min(host.clientWidth-230,x-r.left+12))+'px';tip.style.top=Math.max(5,y-r.top-35)+'px';};
 host.onpointerover=show;host.onfocusin=show;host.onpointermove=e=>{if(e.target.closest('[data-point]'))show(e);};host.onpointerleave=()=>tip.hidden=true;host.onfocusout=()=>tip.hidden=true;host.onclick=show;
}
export function lineChart(id,data,series,{money=false,percent=false,label='',unit='',showOrders=true}={}){
 const host=$(id);if(!data.length){host.innerHTML='<div class="analytics-empty">当前筛选下没有订单</div>';return;}
 const w=Math.max(host.clientWidth,280),h=244,l=money?64:48,r=20,t=22,b=35,pw=w-l-r,ph=h-t-b;
 const values=data.flatMap(d=>series.map(s=>d[s.key])).filter(v=>v!=null&&Number.isFinite(v));
 const max=percent?Math.min(1,Math.max(.1,Math.ceil(Math.max(...values,0)*1.15*10)/10)):niceMax(Math.max(...values,1)*1.08);
 const x=i=>data.length===1?l+pw/2:l+i*pw/(data.length-1),y=v=>t+ph-v/max*ph;
 const format=v=>percent?(v*100).toFixed(0)+'%':money?(v>=1000000?(v/1000000).toFixed(1)+'万':num(v/100)):num(v);
 let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><text x="${l}" y="12" class="a-title">${esc(unit||(percent?'比例（%）':money?'金额（元）':'订单（单）'))}</text>`;
 for(let i=0;i<=4;i++){const v=max*i/4,yy=y(v);svg+=`<line class="a-grid" x1="${l}" y1="${yy}" x2="${w-r}" y2="${yy}"/><text x="${l-9}" y="${yy+3}" text-anchor="end">${format(v)}</text>`;}
 svg+=`<line class="a-axis" x1="${l}" y1="${t+ph}" x2="${w-r}" y2="${t+ph}"/>`;
 const step=Math.max(1,Math.ceil((data.length-1)/(w<450?3:6)));
 data.forEach((d,i)=>{if((i%step===0&&(i===0||data.length-1-i>=step*.7))||i===data.length-1)svg+=`<text x="${x(i)}" y="${h-12}" text-anchor="${i===0?'start':i===data.length-1?'end':'middle'}">${d.date.slice(5).replace('-','/')}</text>`;});
 for(const s of series){let path='',start=true;data.forEach((d,i)=>{const v=d[s.key];if(v==null){start=true;return;}path+=(start?'M':'L')+x(i).toFixed(1)+','+y(v).toFixed(1);start=false;});svg+=`<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.2"/>`;
 data.forEach((d,i)=>{if(d[s.key]!=null)svg+=`<circle class="a-point" tabindex="0" role="button" aria-label="${d.date} ${esc(s.label)} ${percent?pct(d[s.key]):money?cash(d[s.key]):num(d[s.key])}" data-point="${i}" cx="${x(i)}" cy="${y(d[s.key])}" r="4.5" fill="${s.color}" stroke="white" stroke-width="1.5"/>`;});}
 host.innerHTML=svg+'</svg><div class="a-tooltip" role="tooltip" hidden></div>';
 tipEvents(host,data,d=>`<strong>${d.date}</strong>${series.map(s=>`<div>${s.label}：${percent?pct(d[s.key]):money?cash(d[s.key]):num(d[s.key])}</div>`).join('')}${showOrders?`<div>成交 ${num(d.n)} 单 · 已发货 ${num(d.shipped)} 单</div>`:''}`);
}
function barChart(id,bands,color,label){
 const host=$(id),data=bands.filter(d=>d.n>=20);if(!data.length){host.innerHTML='<div class="analytics-empty">各价格段不足 20 单<br>完整数据保留在分组表，暂不作图比较</div>';return;}
 const w=Math.max(host.clientWidth,280),h=252,l=45,r=15,t=30,b=48,pw=w-l-r,ph=h-t-b;
 const ci=d=>{const z=1.96,n=d.n,p=d.returnRate,den=1+z*z/n,c=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;return [Math.max(0,c-half),Math.min(1,c+half)];};
 const max=Math.min(1,Math.max(.1,...data.map(d=>ci(d)[1]))*1.15),y=v=>t+ph-v/max*ph,slot=pw/data.length;
 let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><text x="${l}" y="13" class="a-title">退货退款成功率（%）</text>`;
 for(let i=0;i<=4;i++){const v=max*i/4;svg+=`<line class="a-grid" x1="${l}" y1="${y(v)}" x2="${w-r}" y2="${y(v)}"/><text x="${l-8}" y="${y(v)+3}" text-anchor="end">${(v*100).toFixed(0)}%</text>`;}
 data.forEach((d,i)=>{const xx=l+slot*(i+.5),bw=slot*.5,[low,high]=ci(d),short=d.label.replace('低于¥50','<50').replace('¥50—不足60','50–<60').replace('¥60—不足70','60–<70').replace('¥70—不足80','70–<80').replace('¥80及以上','≥80');svg+=`<rect tabindex="0" role="button" class="a-point" data-point="${i}" aria-label="${esc(d.label)} ${d.n}单 退货率${pct(d.returnRate)}" x="${xx-bw/2}" y="${y(d.returnRate)}" width="${bw}" height="${Math.max(1,y(0)-y(d.returnRate))}" fill="${color}" opacity=".85"/><path d="M${xx},${y(low)}V${y(high)}M${xx-4},${y(high)}h8M${xx-4},${y(low)}h8" stroke="#647c94" fill="none"/><text x="${xx}" y="${Math.max(24,y(high)-7)}" text-anchor="middle" style="fill:${color}">${pct(d.returnRate)}</text><text x="${xx}" y="${h-26}" text-anchor="middle">${esc(short)}</text><text x="${xx}" y="${h-11}" text-anchor="middle">n=${d.n}</text>`;});
 host.innerHTML=svg+'</svg><div class="a-tooltip" role="tooltip" hidden></div>';tipEvents(host,data,d=>`<strong>${esc(d.label)}</strong>发货订单：${d.n}<br>退货退款：${d.returned}<br>退货率：${pct(d.returnRate)}<br>实收均价：${cash(d.merchantMean)}<br>实付均价：${cash(d.buyerMean)}`);
}
function downloadCsv(headers,rows,name){const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';const content='\uFEFF'+[headers,...rows].map(r=>r.map(quote).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function initAnalytics(){
 const root=$('analyticsRoot'),{rows,cases}=decodeAnalytics(ANALYTICS);let selected=rows,daily=[],window='4',kind='buyer',amount='gross',exportBands=[],resizeTimer;
 root.innerHTML=`
 <section class="analytics-section" id="daily-business"><div class="analytics-heading"><div><h2>每日成交与经营趋势</h2><p>按订单成交日汇总 · 随上方日期、商品与订单筛选联动</p></div><div class="analytics-controls"><select id="businessAmount" aria-label="成交金额口径"><option value="gross">商家实收 · 退款前</option><option value="buyer">买家实付 · 退款前</option></select><button class="button" id="exportDailyAnalytics">导出每日经营</button></div></div><div class="a-stats" id="businessStats"></div><div class="analytics-two"><article class="panel analytics-panel"><h3>成交订单数</h3><p class="analytics-note">包含之后退款的已成交订单；未成交订单不计入</p><div class="a-chart" id="ordersLine"></div></article><article class="panel analytics-panel"><h3 id="amountChartTitle">成交金额 · 商家实收</h3><p class="analytics-note">退款前原始成交金额，和净收入分别观察</p><div class="a-chart" id="amountLine"></div></article></div></section>
 <section class="analytics-section" id="refund-analysis"><div class="analytics-heading"><div><h2>售后与退款分析</h2><p>售后状态截至 ${ANALYTICS.asof} · 重复申请按订单去重</p></div></div><div class="analytics-notice">售后分析采用较新的售后表，成功退款包含部分退款；原利润区仍采用 ${ANALYTICS.orderAsOf} 订单快照、全额退款及完好入库暂估口径。两处口径不同，买家退款金额不能直接等同商家资金扣款。${ANALYTICS.unmatchedCases?'另有 '+ANALYTICS.unmatchedCases+' 笔售后订单未匹配订单表，未计入比率分子。':'本次售后记录均已匹配订单表。'}</div><div class="a-stats" id="refundStats"></div><article class="panel analytics-panel"><h3>每日退货退款率</h3>${legend([{label:'总成功退款率',color:colors.orange},{label:'发货后退款率（含仅退款）',color:colors.teal},{label:'退货退款成功率',color:colors.blue}])}<div class="a-chart" id="refundLine"></div><p class="analytics-help">总退款率＝退款成功订单÷成交订单；发货后两项均以已发货实物订单为分母。近期订单售后尚未走完，曲线右侧偏低不代表最终改善；前几天样本很少。</p></article><div class="analytics-two analytics-full"><article class="panel analytics-panel"><h3>发货后成功退款的处理时间</h3><div class="a-time-row" id="refundTimes"></div><p class="analytics-help" id="timeSample"></p></article><article class="panel analytics-panel"><h3>影响利润的售后项目</h3><ul class="a-risk-list" id="refundRisks"></ul></article></div></section>
 <section class="analytics-section" id="price-analysis"><div class="analytics-heading"><div><h2>价格与退货率的关系</h2><p>商家成交价与买家券后实付分别分析，避免混用</p></div><div class="analytics-controls"><select id="priceWindow" aria-label="价格分析观察窗口"><option value="4">发货4天及以前 · 11/04及以前</option><option value="15">发货15天及以前 · 10/24及以前</option><option value="all">全部已发货 · 含近期</option></select></div></div><div class="a-inline-scope" id="priceScope"></div><div class="a-stats" id="priceStats"></div><div class="analytics-two"><article class="panel analytics-panel"><h3>按商家实收单价</h3><div class="a-chart analytics-bars" id="merchantBars"></div></article><article class="panel analytics-panel"><h3>按买家实付单价</h3><div class="a-chart analytics-bars" id="buyerBars"></div></article></div><article class="panel analytics-panel analytics-full"><div class="analytics-topline"><h3>按优惠差额观察退货</h3><span class="a-micro">（商家实收 − 买家实付）÷ 商家实收</span></div><div class="a-chart analytics-bars" id="gapBars"></div><p class="analytics-help">图仅显示至少 20 单的组；误差线为 95% Wilson 区间。退货率仅指“退货退款”成功订单，包含仅退款的指标见分组表。</p></article><article class="panel analytics-panel analytics-full"><div class="analytics-topline"><h3>价格分组明细</h3><div class="analytics-controls"><select id="priceTableKind" aria-label="价格分组口径"><option value="buyer">按买家实付单价</option><option value="gross">按商家实收单价</option><option value="gap">按优惠差额</option></select><button class="button" id="exportPriceAnalytics">导出分组</button></div></div><div class="a-rate-table" id="priceTable"></div><p class="analytics-help">“4天内申请率”统一观察发货后 4 天内是否发起过退货退款申请，包含后来撤销或失败的申请；这是发起率，不是最终退货率。成功退款状态截至 ${ANALYTICS.asof}。</p></article><div class="analytics-notice" id="priceConclusion"></div></section>`;
 function draw(){
  const t=analysisTotals(selected);daily=dailyStats(selected);
  $('businessStats').innerHTML=card('成交订单',num(t.n)+' 单','含后续退款订单')+card('商家实收 · 退款前',cash(t.gross),'订单原始商家成交金额')+card('买家实付 · 退款前',cash(t.buyer),'平台优惠后买家支付')+card('平均每单实收',t.n?cash(t.gross/t.n):'—','商家实收 ÷ 成交订单');
  lineChart('ordersLine',daily,[{key:'n',label:'成交订单数',color:colors.blue}],{label:'每日成交订单数'});
  $('amountChartTitle').textContent='成交金额 · '+(amount==='gross'?'商家实收':'买家实付');lineChart('amountLine',daily,[{key:amount,label:amount==='gross'?'商家实收（退款前）':'买家实付（退款前）',color:colors.teal}],{money:true,label:'每日成交金额'});
  $('refundStats').innerHTML=card('总成功退款率',pct(t.refundRate),`${num(t.refund)} ÷ ${num(t.n)} 笔成交`)+card('发货后退款率',pct(t.postRefundRate),`${num(t.postRefund)} ÷ ${num(t.shipped)} 笔已发货`)+card('退货退款成功率',pct(t.returnRate),`${num(t.returned)} ÷ ${num(t.shipped)} 笔已发货`)+card('售后申请率',pct(t.n?t.requested/t.n:null),`${num(t.requested)} 个订单 · 含换货`);
  lineChart('refundLine',daily,[{key:'refundRate',label:'总成功退款率',color:colors.orange},{key:'postRefundRate',label:'发货后退款率',color:colors.teal},{key:'returnRate',label:'退货退款成功率',color:colors.blue}],{percent:true,label:'每日成功退款率曲线'});
  const ids=new Set(selected.map(r=>r.order)),cs=caseStats(cases.filter(c=>ids.has(c.order)));
  $('refundTimes').innerHTML=[['发货→申请退款',cs.shipApply],['申请→同意退款',cs.applyApprove],['发货→同意退款',cs.shipApprove]].map(([label,s])=>`<div class="a-time">${label}<strong>${s.mean==null?'—':s.mean.toFixed(2)+' 天'}</strong><span>中位 ${s.median==null?'—':s.median.toFixed(2)} 天</span></div>`).join('');
  $('timeSample').textContent=`当前筛选含 ${cs.postCases} 笔发货后成功售后单；同一订单可能有多次售后。时间是“同意退款”，不是资金到账。`;
  $('refundRisks').innerHTML=`<li>处理中退款 <b>${cs.pending} 单</b>，申请额 <b>${cash(cs.pendingAmount)}</b>；尚未全部计为已发生退款。</li><li>部分退款 <b>${t.partial} 单</b>，不能自动按整单退款及整件入库处理。</li><li>换货补寄成功 <b>${cs.exchanges} 笔</b>，需核对二次运费、包材和货损。</li><li>发货后主要原因：${cs.reasons.slice(0,3).map(([r,n])=>`${esc(r)} ${n} 笔`).join('；')||'无样本'}。</li>`;
  drawPrice();
 }
 function drawPrice(){
  const rr=cohortRows(selected,window,ANALYTICS.cutoffs),t=analysisTotals(rr),gap=bandStats(rr,'gap'),high=gap.at(-1),cut=ANALYTICS.cutoffs[window];
  $('priceScope').textContent=`${window==='all'?'全部已发货实物订单':`${cut} 及以前发货`} · 当前筛选 ${num(t.n)} 单；观察窗口按发货日期，上方日期筛选按成交日期。`;
  $('priceStats').innerHTML=card('观察样本',num(t.n)+' 单',window==='4'?'默认纳入发货约4天及以前':'与上方筛选共同生效')+card('退货退款成功率',pct(t.returnRate),`${num(t.returned)} 笔退货退款`)+card('发货后退款率',pct(t.postRefundRate),`${num(t.postRefund)} 笔，含仅退款`)+card('大额优惠组退货率',pct(high.returnRate),`${high.n} 单，差额占比≥30%`);
  barChart('merchantBars',bandStats(rr,'gross'),colors.blue,'商家实收单价与退货率');barChart('buyerBars',bandStats(rr,'buyer'),colors.teal,'买家实付单价与退货率');barChart('gapBars',gap,colors.purple,'优惠差额与退货率');
  exportBands=bandStats(rr,kind);$('priceTable').innerHTML='<table><thead><tr><th>分组</th><th class="number">发货订单</th><th class="number">实收均价</th><th class="number">实付均价</th><th class="number">退货退款率</th><th class="number">发货后退款率</th><th class="number">4天内申请率</th></tr></thead><tbody>'+exportBands.map(d=>`<tr><td>${esc(d.label)}${d.n>0&&d.n<20?' · 小样本':''}</td><td class="number">${d.n}</td><td class="number">${cash(d.merchantMean)}</td><td class="number">${cash(d.buyerMean)}</td><td class="number">${pct(d.returnRate)}</td><td class="number">${pct(d.postRefundRate)}</td><td class="number">${pct(d.request4Rate)}</td></tr>`).join('')+'</tbody></table>';
  $('priceConclusion').textContent='当前分组按最新订单与售后状态重新计算，展示不同价格、优惠组的实际退货比例及统一4天申请率。差异可能来自优惠客群、商品、投放和售后观察时长，不能证明调价会造成退货变化。4—14天订单仍可能继续退款。';
 }
 $('businessAmount').onchange=e=>{amount=e.target.value;draw();};$('priceWindow').onchange=e=>{window=e.target.value;drawPrice();};$('priceTableKind').onchange=e=>{kind=e.target.value;drawPrice();};
 $('exportDailyAnalytics').onclick=()=>downloadCsv(['成交日期','成交订单','商家实收_退款前','买家实付_退款前','成功退款订单','已发货订单','发货后退款订单','退货退款订单','总退款率_%','发货后退款率_%','退货退款率_%'],daily.map(d=>[d.date,d.n,(d.gross/100).toFixed(2),(d.buyer/100).toFixed(2),d.refund,d.shipped,d.postRefund,d.returned,...[d.refundRate,d.postRefundRate,d.returnRate].map(v=>v==null?'':(v*100).toFixed(4))]),'厚泽_每日经营与退款.csv');
 $('exportPriceAnalytics').onclick=()=>downloadCsv(['分组','发货订单','实收均价','实付均价','退货退款率_%','发货后退款率_%','4天内申请率_%'],exportBands.map(d=>[d.label,d.n,d.merchantMean==null?'':(d.merchantMean/100).toFixed(2),d.buyerMean==null?'':(d.buyerMean/100).toFixed(2),...[d.returnRate,d.postRefundRate,d.request4Rate].map(v=>v==null?'':(v*100).toFixed(4))]),'厚泽_价格与退货率分组.csv');
 addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(draw,130);});
 return {update(profitRows){const ids=new Set(profitRows.map(r=>r.order));selected=rows.filter(r=>ids.has(r.order));draw();}};
}
