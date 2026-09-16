import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {db,exec,q,one,checksumFile} from './db.mjs';

export function backupDir(){return path.resolve(process.env.BACKUP_DIR||'./backups')}
function stamp(){return new Date().toISOString().replace(/[:.]/g,'-')}
export function createBackup(userId=null){
  const dir=backupDir();fs.mkdirSync(dir,{recursive:true});const name=`fpevalua-${stamp()}.tar.gz`,target=path.join(dir,name),tmp=path.join(dir,`.tmp-${process.pid}-${Date.now()}`);fs.mkdirSync(tmp,{recursive:true});
  try{
    db.exec('PRAGMA wal_checkpoint(FULL)');
    const dbFile=path.resolve(process.env.DB_FILE||'./data/fpevalua.sqlite');fs.copyFileSync(dbFile,path.join(tmp,'fpevalua.sqlite'));
    const env=path.resolve('.env');if(fs.existsSync(env))fs.copyFileSync(env,path.join(tmp,'.env'));
    const uploads=path.resolve(process.env.UPLOAD_DIR||'./uploads');if(fs.existsSync(uploads))execFileSync('cp',['-a',uploads,path.join(tmp,'uploads')]);
    const scorm=path.resolve(process.env.SCORM_DIR||'./scorm');if(fs.existsSync(scorm))execFileSync('cp',['-a',scorm,path.join(tmp,'scorm')]);
    fs.writeFileSync(path.join(tmp,'backup.json'),JSON.stringify({app:'FPEvalúa',createdAt:new Date().toISOString(),version:'2.4.0'},null,2));
    execFileSync('tar',['-czf',target,'-C',tmp,'.']);
    const st=fs.statSync(target),hash=checksumFile(target);exec('INSERT INTO backup_history(filename,size,checksum,created_by)VALUES(?,?,?,?)',name,st.size,hash,userId||null);return{filename:name,path:target,size:st.size,checksum:hash};
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
}
export function listBackups(){return q('SELECT * FROM backup_history ORDER BY created_at DESC LIMIT 100').map(r=>({...r,exists:fs.existsSync(path.join(backupDir(),r.filename))}))}
export function backupFile(name){const clean=path.basename(name);const full=path.join(backupDir(),clean);return fs.existsSync(full)?full:null}

function xml(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
export function spreadsheetML({sheets}){
  const head=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DDEBF7" ss:Pattern="Solid"/></Style><Style ss:ID="Good"><Interior ss:Color="#E2F0D9" ss:Pattern="Solid"/></Style><Style ss:ID="Bad"><Interior ss:Color="#FCE4D6" ss:Pattern="Solid"/></Style></Styles>`;
  const body=sheets.map(sh=>`<Worksheet ss:Name="${xml(sh.name).slice(0,31)}"><Table>${(sh.rows||[]).map((row,ri)=>`<Row>${row.map(cell=>{const v=cell?.value??cell;const n=typeof v==='number';const style=cell?.style?` ss:StyleID="${cell.style}"`:(ri===0?' ss:StyleID="Header"':'');return `<Cell${style}><Data ss:Type="${n?'Number':'String'}">${xml(v)}</Data></Cell>`}).join('')}</Row>`).join('')}</Table></Worksheet>`).join('');
  return head+body+'</Workbook>';
}
export function diagnostics(){
  const dbFile=path.resolve(process.env.DB_FILE||'./data/fpevalua.sqlite');return{version:'2.4.0',node:process.version,platform:process.platform,uptimeSeconds:Math.round(process.uptime()),dbFile,dbSize:fs.existsSync(dbFile)?fs.statSync(dbFile).size:0,users:Number(one('SELECT COUNT(*) n FROM users')?.n||0),modules:Number(one('SELECT COUNT(*) n FROM modules')?.n||0),submissions:Number(one('SELECT COUNT(*) n FROM submissions')?.n||0),recoveries:Number(one('SELECT COUNT(*) n FROM recovery_plans')?.n||0),auditRows:Number(one('SELECT COUNT(*) n FROM audit_logs')?.n||0)}
}
