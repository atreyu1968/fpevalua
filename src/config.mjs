import fs from 'node:fs';
import path from 'node:path';

export function loadEnv(file='.env'){
  const p=path.resolve(file);
  if(!fs.existsSync(p)) return;
  for(const line of fs.readFileSync(p,'utf8').split(/\r?\n/)){
    const t=line.trim(); if(!t||t.startsWith('#')) continue;
    const i=t.indexOf('='); if(i<0) continue;
    const k=t.slice(0,i).trim(), v=t.slice(i+1).trim();
    if(process.env[k]===undefined) process.env[k]=v;
  }
}
export function env(name, fallback=''){ return process.env[name] ?? fallback; }
