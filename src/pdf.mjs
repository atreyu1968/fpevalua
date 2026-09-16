import crypto from 'node:crypto';

function latin(s=''){
  return String(s).replace(/€/g,' EUR').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/[^\x09\x0A\x0D\x20-\xFF]/g,'?');
}
function escPdf(s){return latin(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/\r/g,'').replace(/\n/g,' ')}
function wrap(text,width=92){
  const out=[];for(const raw of String(text??'').split(/\r?\n/)){const words=raw.trim().split(/\s+/).filter(Boolean);if(!words.length){out.push('');continue}let line='';for(const w of words){if((line+' '+w).trim().length<=width)line=(line+' '+w).trim();else{if(line)out.push(line);line=w}}if(line)out.push(line)}return out;
}
export function contentFingerprint(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}
export function sha256(buffer){return crypto.createHash('sha256').update(buffer).digest('hex')}

export function createTextPdf({title='FPEvalúa',subtitle='',metadata=[],sections=[],footer='FPEvalúa'}){
  const lines=[];
  const push=(text,{bold=false,size=10,gap=0}={})=>{for(const l of wrap(text,size>=15?68:size>=12?80:96))lines.push({text:l,bold,size,gap});};
  push(title,{bold:true,size:18,gap:6});if(subtitle)push(subtitle,{bold:true,size:11,gap:8});
  for(const [k,v] of metadata)push(`${k}: ${v}`,{size:9});lines.push({text:'',size:8,gap:7});
  for(const sec of sections){if(sec.heading)push(sec.heading,{bold:true,size:12,gap:4});for(const p of sec.paragraphs||[])push(p,{size:9,gap:2});for(const row of sec.rows||[])push(row,{size:9,gap:1});lines.push({text:'',size:8,gap:5});}
  push(footer,{size:7});
  const pages=[];let page=[],y=790;
  for(const line of lines){const h=(line.size||10)+3+(line.gap||0);if(y-h<52){pages.push(page);page=[];y=790}page.push({...line,y});y-=h}if(page.length||!pages.length)pages.push(page);
  const objs=[];const add=s=>{objs.push(Buffer.isBuffer(s)?s:Buffer.from(s,'latin1'));return objs.length};
  const catalog=add('');const pagesObj=add('');const fontReg=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');const fontBold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pageIds=[];
  for(const pg of pages){let content='';for(const l of pg){const f=l.bold?'F2':'F1';content+=`BT /${f} ${l.size||10} Tf 45 ${l.y.toFixed(1)} Td (${escPdf(l.text)}) Tj ET\n`;}const cb=Buffer.from(content,'latin1');const cId=add(Buffer.concat([Buffer.from(`<< /Length ${cb.length} >>\nstream\n`,'latin1'),cb,Buffer.from('endstream','latin1')]));const pId=add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${cId} 0 R >>`);pageIds.push(pId)}
  objs[catalog-1]=Buffer.from(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`,'latin1');objs[pagesObj-1]=Buffer.from(`<< /Type /Pages /Kids [${pageIds.map(x=>`${x} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,'latin1');
  const chunks=[Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n','latin1')],offsets=[0];let offset=chunks[0].length;
  objs.forEach((obj,i)=>{offsets[i+1]=offset;const head=Buffer.from(`${i+1} 0 obj\n`,'latin1'),tail=Buffer.from('\nendobj\n','latin1');chunks.push(head,obj,tail);offset+=head.length+obj.length+tail.length});
  const xref=offset;let xt=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;for(let i=1;i<=objs.length;i++)xt+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;xt+=`trailer\n<< /Size ${objs.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;chunks.push(Buffer.from(xt,'latin1'));return Buffer.concat(chunks);
}
