import crypto from 'node:crypto';

export function hashPassword(password){
  const salt=crypto.randomBytes(16).toString('hex');
  const hash=crypto.scryptSync(password,salt,64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
export function verifyPassword(password,stored){
  try{
    const [scheme,salt,hex]=String(stored||'').split('$');
    if(scheme!=='scrypt') return false;
    const a=Buffer.from(hex,'hex'),b=crypto.scryptSync(password,salt,a.length);
    return a.length===b.length&&crypto.timingSafeEqual(a,b);
  }catch{return false}
}
function b64(obj){return Buffer.from(JSON.stringify(obj)).toString('base64url')}
export function signToken(payload,secret,ttlSec=43200){
  const now=Math.floor(Date.now()/1000);
  const body={...payload,iat:now,exp:now+ttlSec};
  const enc=b64(body);
  const sig=crypto.createHmac('sha256',secret).update(enc).digest('base64url');
  return `${enc}.${sig}`;
}
export function verifyToken(token,secret){
  try{
    if(!token||!token.includes('.')) return null;
    const [enc,sig]=token.split('.');
    const expected=crypto.createHmac('sha256',secret).update(enc).digest('base64url');
    if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return null;
    const payload=JSON.parse(Buffer.from(enc,'base64url').toString('utf8'));
    if(!payload.exp||payload.exp<Math.floor(Date.now()/1000)) return null;
    return payload;
  }catch{return null}
}
export const newJti=()=>crypto.randomBytes(24).toString('base64url');

const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf){
  let bits='',out='';
  for(const b of buf) bits+=b.toString(2).padStart(8,'0');
  for(let i=0;i<bits.length;i+=5){const c=bits.slice(i,i+5).padEnd(5,'0');out+=B32[parseInt(c,2)]}
  return out;
}
export function base32Decode(str){
  const clean=String(str||'').toUpperCase().replace(/[^A-Z2-7]/g,'');
  let bits='';
  for(const c of clean){const v=B32.indexOf(c);if(v<0)continue;bits+=v.toString(2).padStart(5,'0')}
  const bytes=[];
  for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));
  return Buffer.from(bytes);
}
export function generateTotpSecret(){return base32Encode(crypto.randomBytes(20))}
function hotp(secret,counter,digits=6){
  const key=base32Decode(secret),buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(counter));
  const mac=crypto.createHmac('sha1',key).update(buf).digest(),off=mac[mac.length-1]&0x0f;
  const num=(mac.readUInt32BE(off)&0x7fffffff)%(10**digits);
  return String(num).padStart(digits,'0');
}
export function verifyTotp(secret,code,{window=1,period=30}={}){
  const value=String(code||'').replace(/\s/g,'');
  if(!/^\d{6}$/.test(value))return false;
  const step=Math.floor(Date.now()/1000/period);
  for(let delta=-window;delta<=window;delta++){
    const expected=hotp(secret,step+delta);
    if(crypto.timingSafeEqual(Buffer.from(value),Buffer.from(expected)))return true;
  }
  return false;
}
export function totpUri({secret,email,issuer='FPEvalúa'}){
  const label=encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
