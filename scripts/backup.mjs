import {loadEnv} from '../src/config.mjs';loadEnv();
import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import path from 'node:path';
const src=path.resolve(process.env.DB_FILE||'./data/fpevalua.sqlite'),dir=path.resolve('./backups');fs.mkdirSync(dir,{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),dest=path.join(dir,`fpevalua-${stamp}.sqlite`),db=new DatabaseSync(src);db.exec('PRAGMA wal_checkpoint(FULL);');const safe=dest.replace(/'/g,"''");db.exec(`VACUUM INTO '${safe}'`);db.close();console.log(dest);
