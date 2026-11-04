import {metrics} from './core.mjs';
import {analysisTotals,caseStats} from './analytics-core.mjs';
export const AD_KEYS=['spend','dealSpend','gross','net','settled','deals','netDeals','settledDeals','impressions','clicks'];
export const ratio=(a,b)=>a!=null&&b>0?a/b:null;
export function sumAds(rows){
 const t={};for(const k of AD_KEYS)t[k]=rows.length&&rows.every(r=>r[k]!=null)?rows.reduce((s,r)=>s+r[k],0):null;
 return {...t,n:rows.length,ctr:ratio(t.clicks,t.impressions),cpc:ratio(t.spend,t.clicks),clickDeal:ratio(t.deals,t.clicks),netRoas:ratio(t.net,t.spend),settledRoas:ratio(t.settled,t.spend),grossRoas:ratio(t.gross,t.spend),settledCpa:ratio(t.spend,t.settledDeals),amountRetention:ratio(t.settled,t.gross),orderRetention:ratio(t.settledDeals,t.deals)};
}
export function economics(rows,target=.1){
 const m=metrics(rows),other=m.totalCost-m.ad,contribution=m.net-other,budget=contribution-target*m.net;
 return {...m,other,contribution,contributionRate:ratio(contribution,m.net),breakEvenRoas:contribution>0?m.net/contribution:null,storeRoas:ratio(m.net,m.ad),breakEvenBudget:contribution,targetBudget:budget,targetGap:budget-m.ad,reduceForTarget:Math.max(0,m.ad-budget),adShare:ratio(m.ad,m.net),netCpa:ratio(m.ad,m.netOrders),breakEvenCpa:ratio(contribution,m.netOrders),profitPerNet:ratio(m.profit,m.netOrders)};
}
const shift=(date,n)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export function operationWindow(state,period,ops){
 const end=period==='all'?state.end:[state.end,shift(ops.partialDay,-1)].sort()[0];
 const start=period==='all'?state.start:[state.start,shift(end,period==='7'?-6:-13)].sort().at(-1);
 return {start,end};
}
function ms(s){return s?Date.parse(s.replace(' ','T')+'+08:00'):NaN;}
export function fulfillment(rows,timing,asof){
 const map=new Map(timing.map(a=>[a[0],a])),hours=[],pending=[];
 for(const r of rows){if(r.record_type==='expense'||r.goods_id==='1018651466560')continue;const time=map.get(r.order);if(!time)continue;
  if(time[1]){const h=(ms(time[1])-ms(r.time))/36e5;if(Number.isFinite(h)&&h>=0)hours.push(h);}
  if(r.status==='待发货'){const h=(ms(asof)-ms(r.time))/36e5;if(Number.isFinite(h)&&h>=0)pending.push(h);}
 }
 hours.sort((a,b)=>a-b);const q=p=>{const x=(hours.length-1)*p,l=Math.floor(x),h=Math.ceil(x);return hours.length?hours[l]+(hours[h]-hours[l])*(x-l):null;};
 return {shippedSample:hours.length,medianHours:q(.5),p90Hours:q(.9),pending:pending.length,over24:pending.filter(h=>h>24).length,over48:pending.filter(h=>h>48).length,maxPending:pending.length?Math.max(...pending):null};
}
export function refundStress(rows,rate){
 const atRisk=rows.filter(r=>r.status==='已发货，待收货'&&!r.refund_flag&&r.physical);
 const lossBase=atRisk.reduce((s,r)=>s+r.net-r.cost-r.platform-r.tax,0),lostRevenue=atRisk.reduce((s,r)=>s+r.net,0)*rate,m=metrics(rows),loss=lossBase*rate;
 return {orders:atRisk.length,expectedOrders:atRisk.length*rate,loss,profit:m.profit-loss,net:m.net-lostRevenue,margin:ratio(m.profit-loss,m.net-lostRevenue)};
}
export function buildSnapshot(profitRows,analysisRows,cases,ops,state,{period='all',target=.1,stress=.05}={}){
 const win=operationWindow(state,period,ops),rr=profitRows.filter(r=>r.date>=win.start&&r.date<=win.end),ids=new Set(rr.map(r=>r.order)),ar=analysisRows.filter(r=>ids.has(r.order)),cc=cases.filter(c=>ids.has(c.order));
 const contextComplete=!state.query&&(!state.status||state.status==='all')&&(!state.profit||state.profit==='all');
 const adsFor=(start,end,gid=state.product)=>contextComplete?(gid?ops.productDaily:ops.daily).filter(a=>a.date>=start&&a.date<=end&&(!gid||a.goods===gid)):[];
 const adRows=adsFor(win.start,win.end),ad=sumAds(adRows),e=economics(rr,target),refund=analysisTotals(ar),mature=analysisTotals(ar.filter(r=>r.ship&&r.ship<=ops.matureCutoff));
 const products=[...new Set(rr.map(r=>r.goods_id))].map(gid=>{const pr=rr.filter(r=>r.goods_id===gid),pids=new Set(pr.map(r=>r.order)),pa=ar.filter(r=>pids.has(r.order));return {goods:gid,code:pr[0].code,name:pr[0].name,e:economics(pr,target),refund:analysisTotals(pa),mature:analysisTotals(pa.filter(r=>r.ship&&r.ship<=ops.matureCutoff)),ad:sumAds(adsFor(win.start,win.end,gid))};}).sort((a,b)=>a.e.profit-b.e.profit);
 const daily=[...new Set(rr.map(r=>r.date))].sort().map(date=>{const dr=rr.filter(r=>r.date===date),de=economics(dr,target),da=ar.filter(r=>r.date===date);return {...sumAds(adsFor(date,date)),date,n:de.orders,shipped:da.filter(r=>r.ship).length,spend:de.ad,budget:Math.max(0,de.breakEvenBudget),profit:de.profit,ledgerSpend:de.ad};});
 // The chart's spend uses the order ledger, including today's authorized manual amount.
 daily.forEach(d=>d.spend=d.ledgerSpend);
 const completeDates=[...new Set(adRows.map(a=>a.date))].sort(),end=completeDates.at(-1),trend={current:sumAds([]),previous:sumAds([]),valid:false};
 if(end){const start=shift(end,-6),prevStart=shift(end,-13),prevEnd=shift(end,-7),cur=adsFor(start,end),prev=adsFor(prevStart,prevEnd),inRange=win.start<=prevStart;
  if(inRange&&new Set(cur.map(a=>a.date)).size===7&&new Set(prev.map(a=>a.date)).size===7){trend.current=sumAds(cur);trend.previous=sumAds(prev);trend.valid=true;trend.start=start;trend.end=end;trend.prevStart=prevStart;trend.prevEnd=prevEnd;}}
 return {win,rr,ar,e,ad,refund,mature,products,daily,contextComplete,adDates:completeDates,case:caseStats(cc),fulfillment:fulfillment(rr,ops.timing,ops.orderAsOf),stress:refundStress(rr,stress),trend};
}
