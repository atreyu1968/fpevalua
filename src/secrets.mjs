import crypto from 'node:crypto';

function secretKey(){
  const base=process.env.AI_ENCRYPTION_KEY||process.env.SESSION_SECRET||'';
  if(!base) throw new Error('Debe configurar SESSION_SECRET o AI_ENCRYPTION_KEY para proteger la clave de IA');
  return crypto.createHash('sha256').update(base,'utf8').digest();
}

export function encryptSecret(value){
  if(!value) return null;
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',secretKey(),iv);
  const encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(value){
  if(!value) return '';
  const [version,iv64,tag64,data64]=String(value).split(':');
  if(version!=='v1'||!iv64||!tag64||!data64) throw new Error('Formato de secreto cifrado no válido');
  const decipher=crypto.createDecipheriv('aes-256-gcm',secretKey(),Buffer.from(iv64,'base64url'));
  decipher.setAuthTag(Buffer.from(tag64,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data64,'base64url')),decipher.final()]).toString('utf8');
}

export function maskedSecret(value){
  if(!value) return '';
  const s=String(value);
  if(s.length<=8) return '••••••••';
  return `${s.slice(0,3)}••••••••${s.slice(-4)}`;
}
