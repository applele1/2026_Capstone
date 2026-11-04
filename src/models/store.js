import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {config} from '../config.js';
// demo 모드: 식당·메뉴·카테고리는 엑셀에서 옮긴 data/seed/bapit-data.json을 읽기 전용으로 사용하고,
// 회원·세션·후기·찜·최근 기록만 data/demo.json에 저장합니다.
const SEED_PATH=new URL('../../data/seed/bapit-data.json',import.meta.url);
const emptyUserData=()=>({users:[],sessions:[],reviews:[],favorites:[],recentViews:[]});
let data,catalog,queue=Promise.resolve();
export let db;
export async function initializeStore(){
 if(config.storage==='postgres'){const {PrismaClient}=await import('@prisma/client');db=new PrismaClient();await db.$connect();return;}
 catalog=buildCatalog(JSON.parse(await readFile(SEED_PATH,'utf8')));
 await mkdir(path.dirname(config.dataPath),{recursive:true});
 try{
  data=JSON.parse(await readFile(config.dataPath,'utf8'));
  // 예전 버전(예시 식당 포함) demo.json이면 예시 식당과 그 식당에 남긴 기록을 정리합니다.
  if(data.restaurants){const {users=[],sessions=[]}=data;data={...emptyUserData(),users,sessions};await persist(data);}
  data={...emptyUserData(),...data};
 }catch(e){if(e.code!=='ENOENT')throw e;data=emptyUserData();await persist(data);}
}
function buildCatalog(seed){
 const cats=new Map();for(const [menuId,categoryId] of seed.menuCategories){if(!cats.has(menuId))cats.set(menuId,[]);cats.get(menuId).push(categoryId);}
 const menus=seed.menus.map(m=>({id:m.id,restaurantId:m.restaurantId,name:m.name,price:m.price,categoryIds:cats.get(m.id)||[]}));
 return {categories:[...seed.categories].sort((a,b)=>a.id-b.id),restaurants:seed.restaurants.map(r=>({...r,menus:menus.filter(m=>m.restaurantId===r.id)}))};
}
export const readCatalog=fn=>fn(catalog);
async function persist(value){const tmp=config.dataPath+'.tmp';await writeFile(tmp,JSON.stringify(value,null,2),{mode:0o600});await rename(tmp,config.dataPath);}
export function readStore(fn){return fn(data);}
export function mutateStore(fn){
 const task=queue.then(async()=>{const next=structuredClone(data);const result=fn(next);await persist(next);data=next;return result;});
 queue=task.catch(()=>{});return task;
}
export function nextId(rows){return Math.max(0,...rows.map(x=>x.id))+1;}
