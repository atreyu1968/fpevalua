function parseJSON(value,fallback=null){try{return JSON.parse(value)}catch{return fallback}}
const norm=s=>String(s??'').trim().toLowerCase().replace(/\s+/g,' ');
function numeric(v){if(typeof v==='number')return v;const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null}
function compareSet(a,b){const aa=[...new Set((a||[]).map(norm))].sort(),bb=[...new Set((b||[]).map(norm))].sort();return aa.length===bb.length&&aa.every((v,i)=>v===bb[i])}
function parseJournal(value){
  const obj=typeof value==='string'?parseJSON(value,[]):value;
  if(!Array.isArray(obj))return[];
  return obj.map(r=>({account:norm(r.account||r.code||r.name),debit:numeric(r.debit)||0,credit:numeric(r.credit)||0})).filter(r=>r.account);
}
function journalScore(answer,solution,tol=.01){
  const a=parseJournal(answer),s=parseJournal(solution);if(!s.length)return null;if(!a.length)return 0;
  let points=0,total=s.length*3+1;
  for(const exp of s){const row=a.find(x=>x.account===exp.account);if(!row)continue;points+=1;if(Math.abs(row.debit-exp.debit)<=tol)points+=1;if(Math.abs(row.credit-exp.credit)<=tol)points+=1}
  const balanced=Math.abs(a.reduce((x,r)=>x+r.debit,0)-a.reduce((x,r)=>x+r.credit,0))<=tol;if(balanced)points+=1;
  return Math.round((points/total)*1000)/100;
}
export function gradeItem(item,answer){
  if(!item.auto_correct)return null;
  const cfg=parseJSON(item.config_json,{})||{},sol=parseJSON(item.solution_json,null),type=item.item_type||'long_text';
  if(sol===null)return null;
  let score=null;
  if(type==='choice'||type==='true_false'||type==='short_text')score=norm(answer)===norm(sol.value??sol)?10:0;
  else if(type==='multi_choice'){
    const ans=Array.isArray(answer)?answer:parseJSON(answer,[]);score=compareSet(ans,sol.values??sol)?10:0;
  }else if(type==='number'){
    const av=numeric(answer),sv=numeric(sol.value??sol),tol=Number(cfg.tolerance??sol.tolerance??0.01);score=av!==null&&sv!==null&&Math.abs(av-sv)<=tol?10:0;
  }else if(type==='journal_entry')score=journalScore(answer,sol.entries??sol,Number(cfg.tolerance??.01));
  else if(type==='table'){
    const a=parseJSON(answer,null),expected=sol.rows??sol;if(Array.isArray(a)&&Array.isArray(expected)){let ok=0,total=0;for(let i=0;i<expected.length;i++)for(const [k,v] of Object.entries(expected[i])){total++;if(norm(a?.[i]?.[k])===norm(v))ok++}score=total?Math.round(ok/total*1000)/100:0}
  }
  return score===null?null:Math.max(0,Math.min(10,Number(score)));
}
export function aggregateCriterionAutoScores(items,answers){
  const buckets=new Map();
  for(const item of items){
    const score=gradeItem(item,answers[item.id]??'');if(score===null)continue;
    for(const c of item.criteria||[]){if(!buckets.has(c.id))buckets.set(c.id,[]);buckets.get(c.id).push(score)}
  }
  return [...buckets.entries()].map(([criterionId,scores])=>({criterionId,score:Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100)/100}));
}
