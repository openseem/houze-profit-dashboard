import {sumAds} from './ops-core.mjs';
export const BID_FEE_RATE=.016;
const mean=(rows,fn)=>rows.length?rows.reduce((s,r)=>s+fn(r),0)/rows.length:null;
const floorCent=n=>n==null||!Number.isFinite(n)?null:Math.floor(n+1e-8);
const ceilRatio=n=>n==null||!Number.isFinite(n)?null:Math.ceil(n*100-1e-9)/100;
function refundSample(rows,analysis,cutoff){
 const paid=rows.filter(r=>r.date<=cutoff),shipped=rows.filter(r=>{const a=analysis.get(r.order);return a?.ship&&a.ship<=cutoff;});
 const pre=paid.filter(r=>analysis.get(r.order)?.refund&&!analysis.get(r.order)?.ship).length;
 const post=shipped.filter(r=>analysis.get(r.order)?.refund).length;
 return {preN:paid.length,preRefund:pre,preRate:paid.length?pre/paid.length:null,postN:shipped.length,postRefund:post,postRate:shipped.length?post/shipped.length:null};
}
export function expectedBid({price,cost,fulfillment,qty=1,preRate,postRate,margin=.1,feeRate=BID_FEE_RATE,platformNetShare=null,platformNetValue=null}){
 const valid=[price,cost,fulfillment,qty,preRate,postRate,margin,feeRate].every(Number.isFinite)&&price>0&&cost>=0&&fulfillment>=0&&qty>0&&preRate>=0&&preRate<=1&&postRate>=0&&postRate<=1&&margin>=0&&margin<1&&feeRate>=0&&feeRate<1;
 if(!valid)return {valid:false,feasible:false};
 const shipShare=1-preRate,keepShare=shipShare*(1-postRate),revenue=price*keepShare,goodsCost=cost*keepShare,fulfillmentCost=fulfillment*shipShare,fee=revenue*feeRate,adBudget=revenue*(1-margin)-goodsCost-fulfillmentCost-fee;
 const feasible=keepShare>0&&adBudget>0,finalOrderCpa=feasible?adBudget/keepShare:null,pieceCpa=feasible?finalOrderCpa/qty:null,finalNetRoas=feasible?revenue/adBudget:null;
 const calibrated=feasible&&platformNetShare>0&&platformNetShare<=1&&platformNetValue>0,platformCpa=calibrated?adBudget/platformNetShare:null,platformRoas=calibrated?platformNetValue/platformCpa:null;
 const profit=revenue-goodsCost-fulfillmentCost-fee-adBudget;
 return {valid:true,feasible,calibrated,shipShare,keepShare,totalRefund:1-keepShare,revenue,goodsCost,fulfillmentCost,fee,adBudget,profit,margin:revenue>0?profit/revenue:null,finalOrderCpa,pieceCpa,finalNetRoas,platformCpa,platformRoas,pieceLimit:floorCent(pieceCpa),finalOrderLimit:floorCent(finalOrderCpa),platformLimit:floorCent(platformCpa),platformFloor:ceilRatio(platformRoas),finalNetFloor:ceilRatio(finalNetRoas)};
}
export function planBids(allRows,analysisRows,ops,snapshot,{margin=.1,mode='mature',overrides={},aliases={}}={}){
 const history=allRows.filter(r=>r.record_type!=='expense'&&r.goods_id!=='1018651466560'&&r.qty>0),map=new Map(analysisRows.map(r=>[r.order,r]));
 const cutoff=mode==='observed'?ops.partialDay:ops.matureCutoff,store=refundSample(history,map,cutoff),result=[];
 function choose(own,alias,observed,key){const n=key==='pre'?'preN':'postN',rate=key==='pre'?'preRate':'postRate';
  if(mode==='observed'&&own[n]>0)return {rate:own[rate],n:own[n],basis:'本商品当前已发生'};
  if(own[n]>=30)return {rate:own[rate],n:own[n],basis:'本商品成熟样本'};
  if(alias&&alias[n]>=30)return {rate:alias[rate],n:alias[n],basis:'沿用已确认同款8631'};
  const prior=store[rate],smooth=x=>x[n]>0&&prior!=null?(x[rate]*x[n]+prior*30)/(x[n]+30):null;
  const candidates=[{rate:prior,n:store[n],basis:mode==='observed'?'全店当前回退':'全店成熟回退'},{rate:smooth(own),n:own[n],basis:mode==='observed'?'当前小样本加权':'成熟小样本加权'},{rate:smooth(observed),n:observed[n],basis:'当前已发生样本加权'}].filter(x=>x.rate!=null);
  const conservative=candidates.sort((a,b)=>b.rate-a.rate)[0];return {...conservative,basis:'小样本回退：'+conservative.basis};
 }
 for(const p of snapshot.products){if(p.goods==='1018651466560')continue;
  const current=snapshot.rr.filter(r=>r.goods_id===p.goods&&r.record_type!=='expense'&&r.qty>0);if(!current.length)continue;
  const hist=history.filter(r=>r.goods_id===p.goods),own=refundSample(hist,map,cutoff),observed=refundSample(hist,map,ops.partialDay),alias=aliases[p.goods]?refundSample(history.filter(r=>r.goods_id===aliases[p.goods]),map,cutoff):null;
  const pre=choose(own,alias,observed,'pre'),post=choose(own,alias,observed,'post'),override=overrides[p.goods]||{};
  const preRate=override.pre??pre.rate,postRate=override.post??post.rate;
  const qty=mean(current,r=>r.qty),price=mean(current,r=>r.gross),cost=mean(current,r=>r.unit*r.qty),pack=mean(current,r=>r.pack_unit*r.qty);
  let shipped=current.filter(r=>r.physical),freight,insurance,costBasis='当前商品履约记录（含预留）';
  if(!shipped.length){shipped=hist.filter(r=>r.physical);costBasis=shipped.length?'沿用同商品历史履约记录':'无履约样本，按运费2.60、保险1.25预留';}
  freight=shipped.length?mean(shipped,r=>r.freight):260;insurance=shipped.length?mean(shipped,r=>r.insurance):125;
  const adRows=ops.productDaily.filter(r=>r.goods===p.goods&&r.date>=snapshot.win.start&&r.date<=snapshot.win.end),ad=sumAds(adRows);
  const platformNetShare=ad.deals>0&&ad.netDeals>0?ad.netDeals/ad.deals:null,platformNetValue=ad.netDeals>0?ad.net/ad.netDeals:null;
  const model=expectedBid({price,cost,fulfillment:pack+freight+insurance,qty,preRate,postRate,margin,platformNetShare,platformNetValue});
  result.push({goods:p.goods,code:p.code,name:p.name,orders:current.length,qty,price,cost,unitCost:cost/qty,pack,freight,insurance,costBasis,preRate,postRate,preBasis:override.pre!=null?'手动假设':pre.basis,postBasis:override.post!=null?'手动假设':post.basis,preN:pre.n,postN:post.n,ownPreN:own.preN,ownPostN:own.postN,adDeals:ad.deals,netDeals:ad.netDeals,platformNetShare,platformNetValue,adStart:adRows.length?adRows.map(r=>r.date).sort()[0]:null,adEnd:adRows.length?adRows.map(r=>r.date).sort().at(-1):null,lowConfidence:current.length<30||own.preN<30||own.postN<30||!(ad.deals>=30),model});
 }
 return result.sort((a,b)=>a.code.localeCompare(b.code,'zh-CN')||a.goods.localeCompare(b.goods));
}
