import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {deepRecommend,parseText,normalizeOptions,buildProfile} from '../src/services/deepRecommendation.js';
import {attributesOf} from '../scripts/menu-attributes.js';
let server,base,temp;
before(async()=>{temp=await mkdtemp(path.join(os.tmpdir(),'bapit-deep-'));process.env.DEMO_DATA_PATH=path.join(temp,'db.json');process.env.STORAGE_MODE='demo';process.env.KAKAO_MAP_JS_KEY='';
 const {initializeStore}=await import('../src/models/store.js');await initializeStore();const {app}=await import('../src/app.js');server=app.listen(0);await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;});
after(async()=>{await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true});});
async function call(route,{method='GET',body,cookie}={}){const r=await fetch(base+'/api'+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const login=async(email,password)=>(await call('/auth/login',{method:'POST',body:{email,password}})).cookie;

const school={lat:0,lng:0},cats=[{id:1,name:'한식'},{id:2,name:'면'},{id:3,name:'일식'}],tags=[{id:1,name:'뜨끈한'},{id:2,name:'시원한'}];
const menu=(id,name,price,extra={})=>({id,name,price,spicyLevel:0,portionLevel:2,isRice:false,isNoodle:false,isSoup:false,isMeat:false,categoryIds:[],tagIds:[],...extra});
const rows=[
 {id:1,name:'국수집',lat:0,lng:0,reviews:[],menus:[menu(1,'얼큰칼국수',8000,{spicyLevel:2,isNoodle:true,isSoup:true,categoryIds:[2],tagIds:[1]}),menu(2,'물냉면',7000,{isNoodle:true,isSoup:true,categoryIds:[2],tagIds:[2]})]},
 {id:2,name:'백반집',lat:.001,lng:0,reviews:[],menus:[menu(3,'된장찌개',8000,{isRice:true,isSoup:true,categoryIds:[1],tagIds:[1]}),menu(4,'닭한마리(2인)',9000,{isMeat:true,categoryIds:[1]})]},
 {id:3,name:'초밥집',lat:.004,lng:0,reviews:[],menus:[menu(5,'연어초밥',9500,{isRice:true,categoryIds:[3]}),menu(6,'특선초밥',25000,{isRice:true,categoryIds:[3]})]}
];
const opts=(o={})=>normalizeOptions({budget:10000,...o},{categories:cats,tags});
const ctx=(extra={})=>({school,categories:cats,tags,...extra});

test('메뉴 속성 자동 생성 규칙',()=>{
 const a=attributesOf({name:'얼큰칼국수',restaurantId:1},['면']);assert.equal(a.spicy_level,2);assert.ok(a.is_noodle&&a.is_soup);assert.ok(a.tags.includes('뜨끈한'));
 const b=attributesOf({name:'숯불닭고기덮밥',restaurantId:4},['덮밥']);assert.equal(b.spicy_level,0,'숯불닭 ≠ 불닭 소스');assert.ok(b.is_rice&&b.is_meat);
 const c=attributesOf({name:'후덕죽싸이버거 단품',restaurantId:27},['패스트푸드']);assert.ok(!c.is_soup,'후덕죽은 죽이 아님');
 assert.ok(attributesOf({name:'물냉면',restaurantId:8},['면']).tags.includes('시원한'));
});

test('자연어 조건 찾기',()=>{
 const p=parseText('비 오는데 뜨끈하고 얼큰한 거 만원 안쪽으로',{categories:cats,tags});
 assert.deepEqual(p.types,['soup']);assert.deepEqual(p.tags,[1]);assert.equal(p.spicy,'hot');assert.equal(p.budget,10000);
 assert.equal(parseText('안 매운 일식 8천원',{categories:cats,tags}).spicy,'none');
 assert.equal(parseText('안 매운 일식 8천원',{categories:cats,tags}).budget,8000);
 assert.deepEqual(parseText('안 매운 일식 8천원',{categories:cats,tags}).categories,[3]);
 assert.equal(parseText('가까운 데서 든든하게 1.5만원',{categories:cats,tags}).budget,15000);
 assert.equal(parseText('가까운 데서 든든하게',{categories:cats,tags}).walk,5);
});

test('하드 필터: 예산·여럿이 먹는 메뉴·안 맵게·거리·카테고리',()=>{
 const all=deepRecommend(rows,opts(),ctx()).items;
 assert.ok(all.every(x=>x.price<=10000&&!x.menuName.includes('2인')));
 assert.ok(deepRecommend(rows,opts({spicy:'none'}),ctx()).items.every(x=>x.spicyLevel===0));
 assert.ok(deepRecommend(rows,opts({walk:5}),ctx()).items.every(x=>x.walkMinutes<=5),'450m 초밥집 제외');
 assert.deepEqual(deepRecommend(rows,opts({categories:'3'}),ctx()).items.map(x=>x.menuName),['연어초밥']);
 assert.throws(()=>opts({types:'pizza'}));assert.throws(()=>opts({budget:100}));
});

test('조건 일치가 먼저, 기록이 없으면 취향 대신 평점·인기',()=>{
 const r=deepRecommend(rows,opts({types:'noodle,soup',spicy:'hot'}),ctx());
 assert.equal(r.items[0].menuName,'얼큰칼국수');assert.equal(r.personalized,false);assert.equal(r.weights.taste,0);
 assert.ok(r.items[0].reasons.some(x=>x.text==='면 요리'));
});

test('개인 취향: 같은 조건이어도 사람마다 순서가 다르다',()=>{
 const now=Date.now(),at=new Date(now-86400000).toISOString();
 const sushiLover={interactions:[5,5,5,5].map(menuId=>({menuId,restaurantId:3,type:'click',createdAt:at})),favorites:[{restaurantId:3,createdAt:at}],reviews:[]};
 const noodleLover={interactions:[1,1,2,2].map(menuId=>({menuId,restaurantId:1,type:'click',createdAt:at})),favorites:[],reviews:[{restaurantId:1,rating:5,createdAt:at}]};
 const a=deepRecommend(rows,opts(),ctx({signals:sushiLover,now})),b=deepRecommend(rows,opts(),ctx({signals:noodleLover,now}));
 assert.ok(a.personalized&&b.personalized);
 const rank=(r,name)=>r.items.findIndex(x=>x.menuName===name);
 assert.ok(rank(a,'연어초밥')<rank(b,'연어초밥'),'초밥을 자주 본 사람에게 초밥이 더 위');
 assert.equal(b.items[0].restaurantId,1,'면 러버는 국수집이 1위');
 const ta=a.items.find(x=>x.menuName==='연어초밥').breakdown.taste.value,tb=b.items.find(x=>x.menuName==='연어초밥').breakdown.taste.value;assert.ok(ta>tb);
 assert.ok(buildProfile(rows,noodleLover,now).lift.get('type:noodle')>0);
});

test('API: 비로그인·회원·관리자',async()=>{
 const users=JSON.parse(await readFile(new URL('../data/seed/bapit-test-users.json',import.meta.url),'utf8')).users;
 assert.equal(users.length,51);assert.equal(users.filter(u=>u.role==='admin').length,1);
 const o=await call('/recommend/options');assert.equal(o.status,200);assert.ok(o.data.tags.length>=7);
 const anon=await call('/recommend/deep?budget=10000&types=noodle&spicy=hot');assert.equal(anon.status,200);assert.equal(anon.data.personalized,false);assert.ok(anon.data.items.length>0);assert.ok(!('breakdown' in anon.data.items[0]),'점수 상세는 관리자만');
 assert.equal((await call('/recommend/deep?budget=1')).status,400);
 assert.equal((await call('/recommend/parse?text='+encodeURIComponent('시원한 면'))).data.options.types[0],'noodle');

 const user=await login('user01@bapit.test','test1234!');assert.ok(user,'테스트 회원 로그인');
 const me=await call('/recommend/deep?budget=10000',{cookie:user});assert.equal(me.data.personalized,true);assert.ok(me.data.profile.liked.length>0);
 const item=me.data.items[0];
 assert.equal((await call('/interactions',{method:'POST',cookie:user,body:{restaurantId:item.restaurantId,menuId:item.menuId,type:'recommend_click'}})).status,201);
 assert.equal((await call('/interactions',{method:'POST',cookie:user,body:{restaurantId:item.restaurantId,type:'hack'}})).status,400);
 assert.equal((await call('/interactions',{method:'POST',body:{restaurantId:1,type:'click'}})).status,401);
 assert.equal((await call('/admin/users',{cookie:user})).status,403);
 assert.equal((await call('/recommend/deep?budget=10000&asUser=3',{cookie:user})).status,403);

 const admin=await login('admin@bapit.test','admin1234!');
 assert.equal((await call('/auth/me',{cookie:admin})).data.user.role,'admin');
 const list=await call('/admin/users',{cookie:admin});assert.equal(list.status,200);assert.ok(list.data.items.every(u=>!('password' in u)));
 const stats=await call('/admin/stats',{cookie:admin});assert.equal(stats.data.users,51);
 const as=await call('/recommend/deep?budget=10000&asUser=3',{cookie:admin});assert.equal(as.data.asUser.id,3);assert.ok('breakdown' in as.data.items[0]);
 // 상세를 열면 view 기록이 남습니다.
 const before=(await call('/admin/stats',{cookie:admin})).data.interactions.view||0;await call('/restaurants/1',{cookie:user});
 assert.equal((await call('/admin/stats',{cookie:admin})).data.interactions.view,before+1);
});
