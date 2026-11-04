export const categories={all:'전체',korean:'한식',noodle:'면',ricebowl:'덮밥',japanese:'일식',chinese:'중식',snack:'분식',fastfood:'패스트푸드',salad:'샐러드&포케',western:'양식'};
// 버튼에는 없지만 기존 데이터에 남아 있을 수 있는 카테고리 이름 표시용입니다. ('전체'에서만 보입니다)
const extraLabels={cafe:'카페'};
// DB의 세부 카테고리(예: '칼국수', '햄버거/치킨')를 화면의 카테고리 버튼(한식/면/덮밥/...)으로 묶습니다.
// 새 카테고리를 DB에 추가하면 여기에도 한 줄 추가하세요. 없는 값은 '전체'에서만 보입니다.
const categoryGroups={
 korean:['한식','해장국/순대국','순대국','닭곰탕','곰탕','고기뷔페','닭갈비','해물탕','국밥','백반','묵밥/한식','도시락','보쌈','추어탕','찌개','김치찌개'],
 noodle:['면','국수','국수/냉면','칼국수','냉면','국수/칼국수','라멘','라면','우동','쌀국수','짬뽕'],
 ricebowl:['덮밥','덮밥/돈부리','돈부리','비빔밥','카레'],
 japanese:['일식','초밥','돈까스','육회/연어','회'],
 chinese:['중식','마라탕','짜장면','마라샹궈'],
 snack:['분식','떡볶이','토스트','김밥'],
 fastfood:['패스트푸드','햄버거','햄버거/치킨','치킨','피자','샌드위치','핫도그'],
 salad:['샐러드&포케','샐러드','포케','샐러드/포케'],
 western:['양식','경양식/돈까스','파스타','스테이크','리조또']
};
const groupByName=Object.fromEntries(Object.entries(categoryGroups).flatMap(([key,names])=>names.map(n=>[n,key])));
export const categoryGroup=category=>Object.hasOwn(categories,category)?category:(groupByName[category]||'etc');
export const categoryLabel=category=>categories[category]||extraLabels[category]||category||'';
export function distanceMeters(a,b){const rad=x=>x*Math.PI/180;const dlat=rad(b.lat-a.lat),dlng=rad(b.lng-a.lng);const h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlng/2)**2;return Math.round(6371000*2*Math.asin(Math.sqrt(Math.min(1,h))));}
export function summarize(r,school){const reviews=r.reviews||[];const {reviews:_,...rest}=r;return {...rest,categoryName:categoryLabel(r.category),distance:distanceMeters(school,r),rating:reviews.length?Math.round(reviews.reduce((s,v)=>s+v.rating,0)/reviews.length*10)/10:null,reviewCount:reviews.length};}
const scoreOf=(price,budget,distance)=>Math.round(100*(.6*(1-price/budget)+.4*(1-Math.min(distance/1500,1))));
// 목록 한 줄 = 메뉴 한 개. 식당 정보는 지도 표시·찜·후기에 쓰도록 함께 담습니다.
export function menuItem(r,menu,school,budget){const {menus:_,...row}=summarize(r,school);const item={...row,restaurantId:r.id,menuId:menu.id,menuName:menu.name,price:menu.price};if(budget)item.score=scoreOf(menu.price,budget,row.distance);return item;}
// 찜/최근 목록처럼 식당 단위 목록에서는 가장 저렴한 메뉴를 대표 메뉴로 보여줍니다.
export function representativeItem(r,school){const menu=[...(r.menus||[])].sort((a,b)=>a.price-b.price)[0];return menu?menuItem(r,menu,school):{...summarize(r,school),restaurantId:r.id,menuId:null,menuName:'메뉴 없음',price:null};}
// 식당마다 예산 안에서 추천 점수가 가장 높은 메뉴 1개를 고르고, 그 메뉴들을 정렬해 목록으로 보여줍니다.
export function recommend(rows,{budget,category='all',sort='recommend'},school){
 return rows.filter(r=>category==='all'||categoryGroup(r.category)===category)
  .map(r=>(r.menus||[]).filter(m=>m.price<=budget).map(m=>menuItem(r,m,school,budget)).sort((a,b)=>b.score-a.score||a.price-b.price||a.menuId-b.menuId)[0])
  .filter(Boolean)
  .sort((a,b)=>sort==='price'?a.price-b.price||a.distance-b.distance:sort==='distance'?a.distance-b.distance||a.price-b.price:b.score-a.score||a.distance-b.distance);
}
