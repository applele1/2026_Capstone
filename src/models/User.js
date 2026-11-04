import {config} from '../config.js';
import {db,readStore,mutateStore,nextId} from './store.js';
export const User = {
 findByEmail: async email => config.storage==='postgres' ? db.user.findUnique({where:{email}}) : readStore(d=>d.users.find(x=>x.email===email)),
 create: async fields => {
  if(config.storage==='postgres') return db.user.create({data:fields});
  return mutateStore(d=>{if(d.users.some(x=>x.email===fields.email)) {const e=new Error('이미 가입된 이메일입니다.');e.status=409;throw e;} const user={...fields,id:nextId(d.users),createdAt:new Date().toISOString()};d.users.push(user);return user;});
 },
 createSession: async (userId,tokenHash,expiresAt) => config.storage==='postgres' ? db.session.create({data:{userId,tokenHash,expiresAt}}) : mutateStore(d=>{d.sessions=d.sessions.filter(x=>new Date(x.expiresAt)>new Date());d.sessions.push({userId,tokenHash,expiresAt});}),
 sessionUser: async tokenHash => {
  if(config.storage==='postgres'){const s=await db.session.findUnique({where:{tokenHash},include:{user:true}}); return s && s.expiresAt>new Date() ? s.user : null;}
  return readStore(d=>{const s=d.sessions.find(x=>x.tokenHash===tokenHash && new Date(x.expiresAt)>new Date());return s?d.users.find(x=>x.id===s.userId):null;});
 },
 removeSession: async tokenHash => config.storage==='postgres' ? db.session.deleteMany({where:{tokenHash}}) : mutateStore(d=>{d.sessions=d.sessions.filter(x=>x.tokenHash!==tokenHash);})
};
