import zlib from 'node:zlib';

function unescapeXml(s=''){return String(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))}
function zipEntries(buf){
  let eocd=-1;for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--){if(buf.readUInt32LE(i)===0x06054b50){eocd=i;break}}
  if(eocd<0)throw new Error('XLSX no válido: no se encontró el directorio ZIP');
  const total=buf.readUInt16LE(eocd+10),offset=buf.readUInt32LE(eocd+16),out=new Map();let p=offset;
  for(let i=0;i<total;i++){
    if(buf.readUInt32LE(p)!==0x02014b50)throw new Error('XLSX no válido: directorio ZIP corrupto');
    const method=buf.readUInt16LE(p+10),csize=buf.readUInt32LE(p+20),usize=buf.readUInt32LE(p+24),nlen=buf.readUInt16LE(p+28),elen=buf.readUInt16LE(p+30),clen=buf.readUInt16LE(p+32),lho=buf.readUInt32LE(p+42),name=buf.subarray(p+46,p+46+nlen).toString('utf8');
    if(buf.readUInt32LE(lho)!==0x04034b50)throw new Error('XLSX no válido: entrada ZIP corrupta');
    const ln=buf.readUInt16LE(lho+26),le=buf.readUInt16LE(lho+28),start=lho+30+ln+le,comp=buf.subarray(start,start+csize);let data;
    if(method===0)data=Buffer.from(comp);else if(method===8)data=zlib.inflateRawSync(comp);else throw new Error(`Compresión ZIP no soportada (${method})`);
    if(usize&&data.length!==usize){/* tolerar pequeñas diferencias */}
    out.set(name,data);p+=46+nlen+elen+clen;
  }
  return out;
}
function sharedStrings(entries){const b=entries.get('xl/sharedStrings.xml');if(!b)return[];const xml=b.toString('utf8'),out=[];for(const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)){const parts=[...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x=>unescapeXml(x[1]));out.push(parts.join(''))}return out}
function attr(s,name){const m=String(s).match(new RegExp('(?:^|\\s)'+name.replace(':','\\:')+'=\"([^\"]*)\"'));return m?.[1]??null}
function workbookSheets(entries){const wb=entries.get('xl/workbook.xml')?.toString('utf8')||'',rels=entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8')||'',relMap=new Map();for(const m of rels.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/g)){const id=attr(m[1],'Id'),target=attr(m[1],'Target');if(id&&target)relMap.set(id,target)}const out=[];for(const m of wb.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>(?:<\/(?:\w+:)?sheet>)?/g)){const name=attr(m[1],'name'),rid=attr(m[1],'r:id');let target=relMap.get(rid);if(!name||!target)continue;target=target.replace(/^\//,'');if(!target.startsWith('xl/'))target='xl/'+target.replace(/^\.\//,'');out.push({name:unescapeXml(name),target})}return out}
function colIndex(ref='A1'){let n=0;for(const ch of ref.match(/^[A-Z]+/i)?.[0]||''){n=n*26+(ch.toUpperCase().charCodeAt(0)-64)}return n-1}
function parseSheet(xml,shared){
  const rows=[];
  for(const rm of xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)){
    const row=[],rx=/<(?:\w+:)?c\b([^>]*?)\/>|<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g;
    for(const cm of rm[1].matchAll(rx)){
      const attrs=cm[1]??cm[2]??'',body=cm[3]??'',ref=(attrs.match(/\br="([^"]+)"/)||[])[1]||'',type=(attrs.match(/\bt="([^"]+)"/)||[])[1]||'',idx=colIndex(ref);if(idx<0)continue;
      let v='';
      if(type==='inlineStr')v=[...body.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(x=>unescapeXml(x[1])).join('');
      else{const raw=(body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)||[])[1];if(raw!==undefined)v=type==='s'?(shared[Number(raw)]??''):type==='b'?(raw==='1'?'SI':'NO'):unescapeXml(raw)}
      if(v!==''||body)row[idx]=v;
    }
    rows.push(row);
  }
  return rows;
}
export function parseXlsx(buffer){const entries=zipEntries(buffer),shared=sharedStrings(entries),out={};for(const s of workbookSheets(entries)){const b=entries.get(s.target);if(b)out[s.name]=parseSheet(b.toString('utf8'),shared)}return out}
export function rowsToObjects(rows){if(!rows?.length)return[];const headers=(rows[0]||[]).map(x=>String(x??'').trim());const out=[];for(const r of rows.slice(1)){const meaningful=headers.some((h,i)=>h&&!h.startsWith('_')&&String(r?.[i]??'').trim()!=='');if(!meaningful)continue;const o={};headers.forEach((h,i)=>{if(h&&!h.startsWith('_'))o[h]=r?.[i]??''});out.push(o)}return out}
