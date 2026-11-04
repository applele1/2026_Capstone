import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {config} from '../config.js';
import {initialData} from './sampleData.js';
let data, queue=Promise.resolve();
export async function initializeStore(){
 if(config.storage === 'postgres') { const {PrismaClient}=await import('@prisma/client'); db=new PrismaClient(); await db.$connect(); return; }
 await mkdir(path.dirname(config.dataPath),{recursive:true});
 try { data=JSON.parse(await readFile(config.dataPath,'utf8')); }
 catch(e){ if(e.code!=='ENOENT') throw e; data=initialData(); await persist(data); }
}
export let db;
async function persist(value){ const tmp=config.dataPath+'.tmp'; await writeFile(tmp,JSON.stringify(value,null,2),{mode:0o600}); await rename(tmp,config.dataPath); }
export function readStore(fn){return fn(data);}
export function mutateStore(fn){
 const task=queue.then(async()=>{const next=structuredClone(data); const result=fn(next); await persist(next); data=next; return result;});
 queue=task.catch(()=>{}); return task;
}
export function nextId(rows){return Math.max(0,...rows.map(x=>x.id))+1;}
