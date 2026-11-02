export function decodeAnalytics(data){
 const rows=data.orders.map(a=>Object.fromEntries(data.orderFields.map((k,i)=>[k,a[i]])));
 const cases=data.cases.map(a=>Object.fromEntries(data.caseFields.map((k,i)=>[k,a[i]])));
 return {rows,cases};
}
export function dailyStats(rows){
 const groups=new Map();
 for(const r of rows){if(!groups.has(r.date))groups.set(r.date,[]);groups.get(r.date).push(r);}
 return [...groups].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,rr])=>({date,...analysisTotals(rr)}));
}
export function analysisTotals(rows){
 const t={n:rows.length,gross:0,buyer:0,refund:0,returned:0,requested:0,shipped:0,postRefund:0,partial:0,request4:0};
 for(const r of rows){t.gross+=r.gross;t.buyer+=r.buyer;t.refund+=r.refund;t.returned+=r.returned;t.requested+=r.requested;t.partial+=r.partial;if(r.ship){t.shipped++;t.postRefund+=r.refund;t.request4+=r.request4;}}
 t.refundRate=t.n?t.refund/t.n:null;t.postRefundRate=t.shipped?t.postRefund/t.shipped:null;t.returnRate=t.shipped?t.returned/t.shipped:null;t.request4Rate=t.shipped?t.request4/t.shipped:null;
 return t;
}
export function cohortRows(rows,window,cutoffs){return rows.filter(r=>r.ship&&(window==='all'||r.ship<=cutoffs[window]));}
export function bandStats(rows,kind='buyer'){
 const definitions=kind==='gap'?[['几乎无差额',-Infinity,.001],['不足10%',.001,.1],['10%—不足30%',.1,.3],['30%及以上',.3,Infinity]]:[['低于¥50',0,50],['¥50—不足60',50,60],['¥60—不足70',60,70],['¥70—不足80',70,80],['¥80及以上',80,Infinity]];
 return definitions.map(([label,lo,hi])=>{
  const rr=rows.filter(r=>{
   if(kind==='gap'){
    const diff=r.gross-r.buyer;
    if(hi===.001)return diff*1000<r.gross;
    if(hi===.1)return diff*1000>=r.gross&&diff*10<r.gross;
    if(hi===.3)return diff*10>=r.gross&&diff*10<r.gross*3;
    return diff*10>=r.gross*3;
   }
   return r[kind]>=lo*100*r.qty&&r[kind]<hi*100*r.qty;
  });
  const t=analysisTotals(rr);return {label,...t,merchantMean:t.n?rr.reduce((s,r)=>s+r.gross/r.qty,0)/t.n:null,buyerMean:t.n?rr.reduce((s,r)=>s+r.buyer/r.qty,0)/t.n:null};
 });
}
export function durationStats(values){
 const v=values.filter(x=>x!=null&&Number.isFinite(x)&&x>=0).sort((a,b)=>a-b);
 if(!v.length)return {n:0,mean:null,median:null,p90:null};
 const quantile=p=>{const i=(v.length-1)*p,l=Math.floor(i),h=Math.ceil(i);return v[l]+(v[h]-v[l])*(i-l);};
 return {n:v.length,mean:v.reduce((s,x)=>s+x,0)/v.length,median:quantile(.5),p90:quantile(.9)};
}
export function caseStats(cases){
 const success=cases.filter(c=>c.status==='退款成功'),post=success.filter(c=>c.phase==='发货后申请');
 const pending=cases.filter(c=>['待商家处理','已同意退货退款，待用户发货'].includes(c.status));
 return {pending:new Set(pending.map(c=>c.order)).size,pendingAmount:pending.reduce((s,c)=>s+c.amount,0),exchanges:cases.filter(c=>c.status==='换货补寄成功').length,postCases:post.length,shipApply:durationStats(post.map(c=>c.shipApply)),applyApprove:durationStats(post.map(c=>c.applyApprove)),shipApprove:durationStats(post.map(c=>c.shipApprove)),reasons:[...post.reduce((m,c)=>m.set(c.reason,(m.get(c.reason)||0)+1),new Map())].sort((a,b)=>b[1]-a[1])};
}
