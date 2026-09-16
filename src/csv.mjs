export function parseCSV(text,{delimiter=null}={}){
  const src=String(text||'').replace(/^\uFEFF/,'');
  if(!delimiter){
    const first=(src.split(/\r?\n/)[0]||'');
    delimiter=(first.split(';').length>first.split(',').length)?';':',';
  }
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<src.length;i++){
    const c=src[i];
    if(quoted){
      if(c==='"'&&src[i+1]==='"'){field+='"';i++}
      else if(c==='"')quoted=false;else field+=c;
    }else{
      if(c==='"')quoted=true;
      else if(c===delimiter){row.push(field);field=''}
      else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field=''}
      else field+=c;
    }
  }
  if(field.length||row.length){row.push(field.replace(/\r$/,''));rows.push(row)}
  if(!rows.length)return[];
  const headers=rows.shift().map(h=>h.trim());
  return rows.filter(r=>r.some(v=>String(v).trim()!=='')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,String(r[i]??'').trim()])));
}
export function csvEscape(value){
  const s=String(value??'');return /[",;\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
}
export function toCSV(rows,columns,{delimiter=';'}={}){
  const header=columns.map(c=>csvEscape(c.label||c.key)).join(delimiter);
  const body=rows.map(r=>columns.map(c=>csvEscape(typeof c.value==='function'?c.value(r):r[c.key])).join(delimiter)).join('\n');
  return '\uFEFF'+header+'\n'+body+'\n';
}
