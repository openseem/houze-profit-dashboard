import {planBids} from './bid-core.mjs';
const bEsc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bMoney=x=>x==null?'—':'¥'+(x/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const bPct=x=>x==null?'—':(x*100).toFixed(2)+'%';
const bRatio=x=>x==null?'—':x.toFixed(2);
export function initBidPlanner({allRows,analysisRows,ops,aliases={}}){
 const root=document.getElementById('bidPlannerRoot');let snapshot,margin=.1,mode='mature',overrides={},plans=[];
 root.innerHTML=`<article id="bid-planner" class="panel analytics-panel analytics-full bid-panel"><div class="analytics-topline"><div><h3>考虑退款后的单件成本与净投产建议</h3><p class="analytics-note">基础目标利润率 <b id="bidTargetValue">10.00%</b> · 利润÷预计退款后收入 · 成本是推广费上限</p></div><div class="analytics-controls"><select id="bidRefundMode" aria-label="出价退款率依据"><option value="mature">成熟样本优先 · 默认</option><option value="observed">当前已发生退款 · 未成熟</option></select><button class="button" id="bidReset">重置退款假设</button><button class="button" id="bidExport">导出出价建议</button></div></div>
 <div class="a-inline-scope" id="bidScope"></div><div class="analytics-notice">“每件最终留存成本”和推广后台“每笔净成交出价”分开计算。推广净成交并未剔除全部售后退款，后台参考值会用该商品推广报表的净成交比例、净成交客单额折算。没有对应净数据时不提供后台数值。</div>
 <div class="bid-guide"><span>① 修改上方目标利润率，默认10%</span><span>② 可逐商品修改两类退款假设</span><span>③ 净成交成本不高于上限，净目标投产不低于下限</span></div>
 <div class="a-rate-table bid-scroll" id="bidTable"></div><p class="analytics-help" id="bidSummary"></p>
 <details class="bid-method"><summary>计算方法、退款样本与边界</summary><div>
 <p><b>模型：</b>设每笔原始成交的商家实收为 P、采购成本为 C、发出一单的包材人工＋运费＋运费险为 F；发货前退款率为 a，发货后退款率为 b（以已发货单为分母）。最终留存比例 k＝(1−a)×(1−b)。预计总退款率＝1−k，不能直接将 a 和 b 相加。</p>
 <p><b>允许推广费 A：</b>A＝P×k×(1−目标利润率−1.6%)−C×k−F×(1−a)。每件最终留存推广上限＝A÷k÷平均件数；退款后收入投产下限＝P×k÷A。包材人工不重复增加，1.6%沿用0.6%平台费及1%税费预留。</p>
 <p><b>后台折算：</b>平台净单比例 q＝报表净成交笔数÷报表成交笔数；净成交客单额 V＝报表净交易额÷净成交笔数。推广净成交出价上限＝A÷q；净目标投产下限＝V÷出价上限。两项采用同一报表范围，属于历史计费比例保持不变的参考；平台实际扣费和成交结构可能变化。</p>
 <p><b>退款依据：</b>默认发货前率取成交满15天的样本，发货后率取发货满15天的样本；分别至少30单才用本商品值。已确认同款的新8631可沿用旧8631；其余不足时，将本商品成熟值、当前已发生值分别与全店成熟率按30个参考样本加权，再取不低于全店成熟率的值，避免仅几单就放大到100%。30个参考样本是规划参数，不是平台规则或统计置信区间。每行均显示样本数和来源。退款样本固定取全量历史，价格及成本跟随当前经营筛选。</p>
 <p><b>成本与恢复：</b>当前商品的商家实收和采购成本按成交单加权；多件订单单列平均件数。履约费用优先用当前商品记录，缺失时用同商品历史，否则按每包运费2.60、运费险1.25及成本表包材人工预留。沿用退货完好入库，发货后退款仍损失履约费用；全额退款、货品结构及费率保持不变。部分退款或货损需另用实际账单校准。</p>
 <p><b>使用：</b>金额上限向下取到分，投产下限向上取两位。A≤0或留存为0时不建议投放；小样本及全店回退只作试算，不据此直接加价。模型达到目标不代表实际经营保证达到目标；两种投产口径不能交叉使用。</p></div></details></article>`;
 function draw(preserveInput=null){
  document.getElementById('bidTargetValue').textContent=bPct(margin);
  if(!snapshot)return;
  document.getElementById('bidScope').textContent=`价格成本范围 ${snapshot.win.start} — ${snapshot.win.end}；历史退款快照 ${ops.asof}；成熟截止 ${ops.matureCutoff}；后台折算仅用有推广报表的日期（最晚 ${ops.adsThrough}）。`;
  if(!snapshot.contextComplete){plans=[];document.getElementById('bidTable').innerHTML='<div class="analytics-empty">请清除订单号、状态或盈亏子集筛选，再计算商品投放建议。</div>';document.getElementById('bidSummary').textContent='避免用只包含退款或亏损订单的样本推导商品出价。';return;}
  plans=planBids(allRows,analysisRows,ops,snapshot,{margin,mode,overrides,aliases});
  const input=(p,part)=>`<label class="bid-rate-label"><input type="number" min="0" max="100" step="0.01" value="${((part==='pre'?p.preRate:p.postRate)*100).toFixed(2)}" data-bid-rate="${part}" data-bid-goods="${p.goods}" aria-label="${bEsc(p.code)} ${p.goods.slice(-4)} ${part==='pre'?'发货前':'发货后'}退款率">%</label><small>${bEsc(part==='pre'?p.preBasis:p.postBasis)} · n=${part==='pre'?p.preN:p.postN}</small>`;
  document.getElementById('bidTable').innerHTML=plans.length?'<table><thead><tr><th>商品 / 商品ID</th><th class="bid-emphasis">推广净成交出价≤</th><th class="bid-emphasis">推广净目标投产≥</th><th class="bid-emphasis">最终净售每件推广费≤</th><th>预计总退款率</th><th>发货前退款率</th><th>发货后退款率</th><th>商家实收 / 采购</th><th>退款后收入投产≥</th><th>依据与成本</th></tr></thead><tbody>'+plans.map(p=>`<tr><td><b>${bEsc(p.code)}</b><small>${p.goods}</small><small>${p.orders} 笔成本样本${p.model.feasible?'':' · 无正投放预算'}</small></td><td class="bid-emphasis">${bMoney(p.model.platformLimit)}<small>元/后台净成交笔</small></td><td class="bid-emphasis">${bRatio(p.model.platformFloor)}<small>后台净交易额口径</small></td><td class="bid-emphasis">${p.model.feasible?bMoney(p.model.pieceLimit):'暂不投放'}<small>元/最终留存件</small></td><td>${bPct(p.model.totalRefund)}<small>组合假设</small></td><td>${input(p,'pre')}</td><td>${input(p,'post')}</td><td>${bMoney(p.price/p.qty)} / ${bMoney(p.unitCost)}<small>元/件 · 均件数 ${p.qty.toFixed(3)}</small></td><td>${bRatio(p.model.finalNetFloor)}<small>店铺核算口径</small></td><td><span class="${p.lowConfidence?'bid-caution':''}">${p.lowConfidence?'小样本或回退，仅试算':'本商品成熟样本'}</span><small>推广成交 n=${p.adDeals??0}，净单 ${p.netDeals??0}</small><small>每发出单履约 ${bMoney(p.pack+p.freight+p.insurance)}</small><small title="${bEsc(p.costBasis)}">运费 ${bMoney(p.freight)} · 保险 ${bMoney(p.insurance)}</small>${!p.model.calibrated?'<small>无正预算或净成交数据，不能折算后台值</small>':''}</td></tr>`).join('')+'</tbody></table>':'<div class="analytics-empty">当前范围没有实物商品订单</div>';
  if(preserveInput?.dataset.bidGoods){const replacement=root.querySelector(`[data-bid-goods="${preserveInput.dataset.bidGoods}"][data-bid-rate="${preserveInput.dataset.bidRate}"]`);if(replacement){replacement.replaceWith(preserveInput);preserveInput.focus({preventScroll:true});}}
  document.getElementById('bidSummary').textContent=`当前 ${plans.length} 个实物商品ID；补差价不作投放建议。金额为可承受推广费上限、投产为最低要求；基础利润率 ${bPct(margin)}。修改退款假设只影响本表，不改历史利润。`;
 }
 document.getElementById('bidRefundMode').onchange=e=>{mode=e.target.value;overrides={};draw();};
 document.getElementById('bidReset').onclick=()=>{overrides={};draw();};
 document.getElementById('bidTable').addEventListener('input',e=>{const input=e.target.closest('[data-bid-rate]');if(!input)return;const value=Number(input.value);if(input.value===''||!Number.isFinite(value)||value<0||value>100){input.setCustomValidity('请输入0至100的退款率');input.setAttribute('aria-invalid','true');return;}input.setCustomValidity('');input.removeAttribute('aria-invalid');overrides[input.dataset.bidGoods]={...overrides[input.dataset.bidGoods],[input.dataset.bidRate]:value/100};draw(input);},true);
 document.getElementById('bidExport').onclick=()=>{const headers=['商品ID','货号','目标利润率_%','发货前退款率_%','发货后退款率_%','预计总退款率_%','最终净售每件推广上限_元','后台净成交出价上限_元每笔','后台净目标投产下限','店铺退款后收入投产下限','平均每单件数','单件商家实收','单件采购成本','每发出单履约费','发货前样本依据','发货前样本数','发货后样本依据','发货后样本数','推广报表起始','推广报表结束','推广原成交笔数','推广净成交笔数','净成交客单额','计费净单比例','样本提示'];
  const rows=plans.map(p=>[p.goods,p.code,margin*100,p.preRate*100,p.postRate*100,p.model.totalRefund*100,p.model.pieceLimit==null?'':(p.model.pieceLimit/100).toFixed(2),p.model.platformLimit==null?'':(p.model.platformLimit/100).toFixed(2),p.model.platformFloor??'',p.model.finalNetFloor??'',p.qty,p.price/p.qty/100,p.unitCost/100,(p.pack+p.freight+p.insurance)/100,p.preBasis,p.preN,p.postBasis,p.postN,p.adStart,p.adEnd,p.adDeals,p.netDeals,p.platformNetValue==null?'':p.platformNetValue/100,p.platformNetShare??'',p.lowConfidence?'小样本或回退，仅试算':'本商品成熟样本']);
  const q=x=>'"'+String(x??'').replaceAll('"','""')+'"',url=URL.createObjectURL(new Blob(['\uFEFF'+[headers,...rows].map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='厚泽_退款后净成交出价建议.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return {update(s,target){snapshot=s;margin=target;draw();}};
}
