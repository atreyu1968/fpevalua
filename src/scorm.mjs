import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

export const scormRoot=()=>path.resolve(process.env.SCORM_DIR||'./scorm');
function safePath(p){const n=String(p||'').replace(/\\/g,'/');return n&&!n.startsWith('/')&&!n.split('/').includes('..')&&!n.includes('\0')}
export function extractScormZip(zipFile,resourceId){
  const root=scormRoot();fs.mkdirSync(root,{recursive:true});const dest=path.join(root,String(resourceId));fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(dest,{recursive:true});
  let entries=[];try{entries=execFileSync('unzip',['-Z1',zipFile],{encoding:'utf8'}).split(/\r?\n/).filter(Boolean)}catch{throw Object.assign(new Error('No se pudo leer el ZIP SCORM. Compruebe que unzip está instalado.'),{status:400})}
  if(!entries.length||entries.some(x=>!safePath(x)))throw Object.assign(new Error('El ZIP contiene rutas no válidas'),{status:400});
  execFileSync('unzip',['-qq','-o',zipFile,'-d',dest]);
  const manifest=path.join(dest,'imsmanifest.xml');if(!fs.existsSync(manifest))throw Object.assign(new Error('El paquete no contiene imsmanifest.xml en la raíz'),{status:400});
  const xml=fs.readFileSync(manifest,'utf8');
  const resources=[...xml.matchAll(/<resource\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]).filter(safePath);
  let launch=resources[0]||'';
  if(!launch){const m=xml.match(/<file\b[^>]*\bhref=["']([^"']+)["']/i);launch=m?.[1]||''}
  if(!safePath(launch)||!fs.existsSync(path.join(dest,launch)))throw Object.assign(new Error('No se ha podido localizar el recurso de lanzamiento del SCORM'),{status:400});
  const titleMatch=xml.match(/<title>([^<]+)<\/title>/i);const title=titleMatch?.[1]?.trim()||'SCORM';
  const version=/adlcp:scormtype/i.test(xml)||/1\.2/i.test(xml)?'1.2':(/2004/i.test(xml)?'2004':'desconocida');
  return{extractedDir:dest,launchPath:launch.replace(/\\/g,'/'),title,version};
}
export function resolveScormFile(extractedDir,requested){
  const rel=decodeURIComponent(String(requested||'')).replace(/^\/+/, '');if(!safePath(rel))return null;
  const base=path.resolve(extractedDir),full=path.resolve(base,rel);if(full!==base&&!full.startsWith(base+path.sep))return null;if(!fs.existsSync(full)||!fs.statSync(full).isFile())return null;return full;
}
export function mimeFor(file){
  const ext=path.extname(file).toLowerCase();return({'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.xml':'application/xml','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.mp4':'video/mp4','.mp3':'audio/mpeg','.pdf':'application/pdf','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'})[ext]||'application/octet-stream';
}
