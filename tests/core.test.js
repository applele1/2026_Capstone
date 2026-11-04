import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {recommend,distanceMeters,priceFit,isSharedMenu,walkMinutes} from '../src/services/recommendation.js';
let server,base,temp;
before(async()=>{temp=await mkdtemp(path.join(os.tmpdir(),'bapit-test-'));process.env.DEMO_DATA_PATH=path.join(temp,'db.json');process.env.STORAGE_MODE='demo';process.env.KAKAO_MAP_JS_KEY='';
 // 예전 버전 demo.json(예시 식당 + 그 식당 찜)이 있어도 예시 데이터를 지우고 시작하는지 확인
 await writeFile(process.env.DEMO_DATA_PATH,JSON.stringify({users:[],sessions:[],restaurants:[{id:1,name:'오늘한상',isSample:true,menus:[]}],reviews:[],favorites:[{userId:1,restaurantId:1}],recentViews:[]}));
 const {initializeStore}=await import('../src/models/store.js');await initializeStore();const {app}=await import('../src/app.js');server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;});
after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});});
async function call(route,{method='GET',body,cookie,origin}={}){const r=await fetch(base+'/api'+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const school={lat:0,lng:0};
const cats=[{id:1,name:'한식'},{id:2,name:'면'}];

test('추천: 메뉴 단위 예산·카테고리, 가격 적합도, 여럿이 먹는 메뉴 제외',()=>{
 const rows=[{id:1,name:'가',lat:0,lng:0,menus:[{id:1,name:'주먹밥',price:2000,categoryIds:[1]},{id:2,name:'제육덮밥',price:8000,categoryIds:[1]},{id:3,name:'닭한마리(2인)',price:8000,categoryIds:[1]}]},
  {id:2,name:'나',lat:.003,lng:0,menus:[{id:4,name:'칼국수',price:7500,categoryIds:[2]}]}];
 const out=recommend(rows,{budget:10000},school,cats);
 assert.equal(out[0].menuName,'제육덮밥','너무 싼 메뉴보다 예산에 알맞은 메뉴가 먼저');
 assert.ok(out.every(x=>x.price<=10000&&!isSharedMenu(x.menuName)));
 assert.deepEqual(recommend(rows,{budget:10000,category:'2'},school,cats).map(x=>x.menuName),['칼국수']);
 assert.equal(recommend(rows,{budget:10000,sort:'price'},school,cats)[0].menuName,'주먹밥');
 assert.deepEqual(recommend(rows,{budget:10000,query:'칼국'},school,cats).map(x=>x.menuName),['칼국수']);
 assert.equal(recommend(rows,{budget:10000,query:'가'},school,cats).length,1,'식당 이름 검색');
 assert.equal(recommend(rows,{budget:1500},school,cats).length,0);
 assert.ok(priceFit(8000,10000)>priceFit(2000,10000));
 assert.ok(isSharedMenu('찜닭(2인)')&&isSharedMenu('탕수육(대)')&&!isSharedMenu('1인 보쌈')&&!isSharedMenu('돈까스'));
 assert.equal(distanceMeters(school,school),0);assert.equal(walkMinutes(0),1);
});

test('실제 데이터(엑셀)만 사용하고 예시 식당은 없다',async()=>{
 const seed=JSON.parse(await readFile(new URL('../data/seed/bapit-data.json',import.meta.url),'utf8'));
 const c=await call('/categories');assert.equal(c.data.items.length,seed.categories.length);
 const all=await call('/restaurants?budget=30000');assert.ok(all.data.items.length>30);
 assert.ok(all.data.items.every(x=>!('isSample' in x)&&x.walkMinutes>0&&x.price<=30000));
 assert.ok(!all.data.items.some(x=>x.name==='오늘한상'));
 const korean=c.data.items.find(x=>x.name==='한식');const r=await call('/restaurants?budget=10000&category='+korean.id);assert.ok(r.data.items.length>0);
 const d=await call('/restaurants/1');assert.equal(d.data.restaurant.name,seed.restaurants[0].name);assert.equal(d.data.restaurant.menus.length,seed.menus.filter(m=>m.restaurantId===1).length);
 const stored=JSON.parse(await readFile(process.env.DEMO_DATA_PATH,'utf8'));assert.equal(stored.restaurants,undefined);assert.equal(stored.favorites.length,0);
});

test('회원 인증 → 찜 → 최근 기록 → 후기 수정·삭제 → 비밀번호 변경 → 탈퇴',async()=>{
 assert.equal((await call('/me/favorites')).status,401);
 assert.equal((await call('/auth/signup',{method:'POST',body:{email:'a@example.com',password:'password123',name:'학생'}})).status,400,'개인정보 동의 필수');
 const signup=await call('/auth/signup',{method:'POST',body:{email:'student@example.com',password:'password123',name:'학생',agree:true}});assert.equal(signup.status,201);assert.equal(signup.data.user.password,undefined);const cookie=signup.cookie;
 assert.equal((await call('/auth/login',{method:'POST',body:{email:'student@example.com',password:'wrongpass'}})).status,401);
 const other=(await call('/auth/login',{method:'POST',body:{email:'student@example.com',password:'password123'}})).cookie;
 assert.equal((await call('/restaurants/1/favorite',{method:'PUT',cookie,body:{saved:true}})).status,200);
 assert.equal((await call('/me/favorites',{cookie})).data.items.length,1);
 assert.equal((await call('/restaurants/1',{cookie})).data.restaurant.saved,true);
 assert.equal((await call('/me/recent',{cookie})).data.items[0].restaurantId,1);
 assert.equal((await call('/restaurants/1/reviews',{method:'POST',cookie,body:{rating:6,comment:'후기'}})).status,400);
 await call('/restaurants/1/reviews',{method:'POST',cookie,body:{rating:5,comment:'맛있어요'}});
 const first=(await call('/restaurants/1')).data.reviews[0];assert.equal(first.updatedAt,null);
 await call('/restaurants/1/reviews',{method:'POST',cookie,body:{rating:4,comment:'수정했어요'}});
 const detail=(await call('/restaurants/1')).data;assert.equal(detail.restaurant.rating,4);assert.equal(detail.reviews.length,1);assert.equal(detail.reviews[0].comment,'수정했어요');
 assert.equal(detail.reviews[0].createdAt,first.createdAt,'수정해도 작성일 유지');assert.ok(detail.reviews[0].updatedAt);
 assert.equal((await call('/restaurants/1/reviews',{method:'DELETE',cookie,body:{}})).status,200);
 assert.equal((await call('/restaurants/1')).data.reviews.length,0);
 assert.equal((await call('/restaurants/999/favorite',{method:'PUT',cookie,body:{saved:true}})).status,404);
 assert.equal((await call('/auth/logout',{method:'POST',cookie,body:{},origin:'https://evil.example'})).status,403);
 assert.equal((await call('/auth/password',{method:'PUT',cookie,body:{currentPassword:'nope12345',newPassword:'newpass123'}})).status,401);
 assert.equal((await call('/auth/password',{method:'PUT',cookie,body:{currentPassword:'password123',newPassword:'newpass123'}})).status,200);
 assert.equal((await call('/me/favorites',{cookie:other})).status,401,'다른 기기 로그인 해제');
 assert.equal((await call('/auth/login',{method:'POST',body:{email:'student@example.com',password:'newpass123'}})).status,200);
 assert.equal((await call('/auth/account',{method:'DELETE',cookie,body:{password:'wrong'}})).status,401);
 assert.equal((await call('/auth/account',{method:'DELETE',cookie,body:{password:'newpass123'}})).status,200);
 assert.equal((await call('/me/favorites',{cookie})).status,401);
 assert.equal((await call('/auth/login',{method:'POST',body:{email:'student@example.com',password:'newpass123'}})).status,401);
 const stored=JSON.parse(await readFile(process.env.DEMO_DATA_PATH,'utf8'));assert.equal(stored.users.length,0);assert.equal(stored.favorites.length,0);
});

test('검색 검증과 화면',async()=>{
 for(const q of ['budget=bad','category=bad','category=999','budget=2500','budget=30500','sort=x','q='+'가'.repeat(31)])assert.equal((await call('/restaurants?'+q)).status,400,q);
 const r=await call('/restaurants?budget=6000');assert.ok(r.data.items.length>0&&r.data.items.every(x=>x.price<=6000&&x.menuName));
 assert.equal((await call('/map/config')).data.jsKey,'');
 const page=await fetch(base);assert.equal(page.status,200);const html=await page.text();assert.match(html,/오늘은 얼마로 먹을까요/);assert.match(html,/샐러드&amp;포케/);
 assert.equal((await fetch(base+'/privacy')).status,200);
});

test('로컬 기록은 해시로 저장되고 저장소 재초기화 후 유지된다',async()=>{
 const s=await call('/auth/signup',{method:'POST',body:{email:'keep@example.com',password:'password123',name:'유지',agree:true}});await call('/restaurants/2/favorite',{method:'PUT',cookie:s.cookie,body:{saved:true}});
 const data=JSON.parse(await readFile(process.env.DEMO_DATA_PATH,'utf8'));assert.ok(data.users[0].password.includes(':'));assert.ok(!data.users[0].password.includes('password123'));assert.ok(data.sessions.every(x=>x.tokenHash.length===64));
 const {initializeStore}=await import('../src/models/store.js');await initializeStore();
 const login=await call('/auth/login',{method:'POST',body:{email:'keep@example.com',password:'password123'}});assert.equal(login.status,200);assert.equal((await call('/me/favorites',{cookie:login.cookie})).data.items.length,1);
});
