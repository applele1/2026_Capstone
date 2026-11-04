import {expandQuery,menuMatches,restaurantMatches} from './search.js';
// ===== 추천 설정 (여기 숫자만 바꾸면 추천 결과가 달라집니다) =====
export const SETTINGS={
 targetRatio:.8,      // 예산의 80% 정도를 쓰는 메뉴를 가장 '알맞은' 가격으로 봅니다.
 priceWeight:.6,      // 가격 적합도 비중
 distanceWeight:.4,   // 거리 비중
 maxDistance:1000,    // 이 거리(m) 이상이면 거리 점수 0점
 walkSpeed:67,        // 도보 속도 (m/분, 약 시속 4km)
 detour:1.3           // 직선거리 → 실제 걷는 거리 보정 (골목·횡단보도)
};
// 카테고리 이름별 아이콘. DB categories 테이블에 새 카테고리를 추가하면 여기에도 한 줄 추가하세요. (없으면 🍽️)
const EMOJI={'한식':'🍚','면':'🍜','덮밥':'🍛','일식':'🍣','중식':'🥟','분식':'🍢','패스트푸드':'🍔','샐러드&포케':'🥗','양식':'🍝'};
export const emojiOf=name=>EMOJI[name]||'🍽️';

export function distanceMeters(a,b){const rad=x=>x*Math.PI/180;const dlat=rad(b.lat-a.lat),dlng=rad(b.lng-a.lng);const h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlng/2)**2;return Math.round(6371000*2*Math.asin(Math.sqrt(Math.min(1,h))));}
export const walkMinutes=distance=>Math.max(1,Math.round(distance*SETTINGS.detour/SETTINGS.walkSpeed));

// '닭한마리(2인)', '탕수육(대)'처럼 여럿이 나눠 먹는 메뉴는 1인 예산 추천에서 제외하고 상세 화면에만 보여줍니다.
export const isSharedMenu=name=>{const n=String(name).match(/(\d+)\s*인/);return (n&&Number(n[1])>=2)||/\((중|대)\)/.test(name);};

// 가격 적합도: 예산의 80%에 가까울수록 1점. 너무 싸거나(예: 2천원 주먹밥) 예산에 꽉 차면 점수가 내려갑니다.
export function priceFit(price,budget){const target=budget*SETTINGS.targetRatio;return Math.max(0,1-Math.abs(price-target)/target);}
export const distanceScore=distance=>1-Math.min(distance/SETTINGS.maxDistance,1);
export const scoreOf=(price,budget,distance)=>Math.round(100*(SETTINGS.priceWeight*priceFit(price,budget)+SETTINGS.distanceWeight*distanceScore(distance)));

const nameMap=categories=>new Map(categories.map(c=>[c.id,c.name]));
// 식당의 대표 카테고리 = 메뉴가 가장 많이 속한 카테고리
function mainCategory(r,names){const count=new Map();for(const m of r.menus||[])for(const id of m.categoryIds||[])count.set(id,(count.get(id)||0)+1);const best=[...count].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0];return best?names.get(best[0]):'';}
function rating(reviews=[]){return reviews.length?Math.round(reviews.reduce((s,v)=>s+v.rating,0)/reviews.length*10)/10:null;}

// 식당 공통 정보 (목록 카드·지도·상세에서 사용)
export function summarize(r,school,categories){const names=nameMap(categories);const distance=distanceMeters(school,r);const categoryName=mainCategory(r,names);
 return {id:r.id,name:r.name,address:r.address,lat:r.lat,lng:r.lng,categoryName,emoji:emojiOf(categoryName),distance,walkMinutes:walkMinutes(distance),rating:rating(r.reviews),reviewCount:(r.reviews||[]).length};}
export function detailMenus(r,categories){const names=nameMap(categories);return [...(r.menus||[])].sort((a,b)=>a.price-b.price||a.id-b.id).map(m=>({id:m.id,name:m.name,price:m.price,shared:isSharedMenu(m.name),categories:(m.categoryIds||[]).map(id=>names.get(id)).filter(Boolean)}));}

// 목록 한 줄 = 메뉴 한 개 (+ 식당 정보)
export function menuItem(r,menu,school,categories,budget){const row=summarize(r,school,categories);const names=nameMap(categories);const menuCategory=names.get((menu.categoryIds||[])[0])||row.categoryName;
 const item={...row,restaurantId:r.id,menuId:menu.id,menuName:menu.name,price:menu.price,categoryName:menuCategory,emoji:emojiOf(menuCategory)};if(budget)item.score=scoreOf(menu.price,budget,row.distance);return item;}
// 찜/최근 목록처럼 식당 단위 목록에서는 1인 메뉴 중 가장 저렴한 메뉴를 대표로 보여줍니다.
export function representativeItem(r,school,categories){const menus=[...(r.menus||[])].sort((a,b)=>a.price-b.price);const menu=menus.find(m=>!isSharedMenu(m.name))||menus[0];
 return menu?menuItem(r,menu,school,categories):{...summarize(r,school,categories),restaurantId:r.id,menuId:null,menuName:'메뉴 없음',price:null};}

// 검색어 동의어 확장 (예: 햄버거 → 버거·와퍼) — 단어 추가는 src/services/search.js의 SYNONYMS에서
// 식당마다 조건(예산·카테고리·검색어)에 맞는 메뉴 중 점수가 가장 높은 메뉴 1개를 고르고 정렬합니다.
export function recommend(rows,{budget,category='all',sort='recommend',query=''},school,categories=[]){
 const ex=expandQuery(query,{categories});
 return rows.map(r=>{
   const fits=(r.menus||[]).filter(m=>m.price<=budget&&!isSharedMenu(m.name)&&(category==='all'||(m.categoryIds||[]).includes(Number(category))));
   // 검색어: 메뉴 이름이 맞으면 그 메뉴를, 식당 이름만 맞으면 그 식당의 메뉴 전체를 후보로 사용합니다.
   // 메뉴 이름(동의어 포함)·카테고리 이름이 맞으면 그 메뉴를, 식당 이름만 맞으면 그 식당의 메뉴 전체를 후보로 사용합니다.
   const nameHits=ex?fits.filter(m=>menuMatches(m,ex)):fits;
   const candidates=nameHits.length?nameHits:(ex&&restaurantMatches(r,ex)?fits:[]);
   return candidates
    .map(m=>menuItem(r,m,school,categories,budget))
    // 가격순이면 식당마다 가장 싼 메뉴, 그 외에는 점수가 가장 높은 메뉴를 대표로 고릅니다.
    .sort((a,b)=>sort==='price'?a.price-b.price||b.score-a.score:b.score-a.score||a.price-b.price||a.menuId-b.menuId)[0];})
  .filter(Boolean)
  .sort((a,b)=>sort==='price'?a.price-b.price||a.distance-b.distance:sort==='distance'?a.distance-b.distance||a.price-b.price:b.score-a.score||a.distance-b.distance);
}