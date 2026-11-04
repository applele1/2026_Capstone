import {scrypt as derive,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(derive);
export const hashToken=token=>createHash('sha256').update(token).digest('hex');
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');return salt+':'+Buffer.from(await scrypt(password,salt,64)).toString('hex');}
export async function verifyPassword(password,stored){const [salt,key]=stored.split(':');const supplied=await scrypt(password,salt,64);const expected=Buffer.from(key,'hex');return expected.length===supplied.length && timingSafeEqual(expected,supplied);}
export const publicUser=u=>u?{id:u.id,name:u.name,email:u.email}:null;
