// ZIP의 식당명/가격을 옮긴 가상 예시 데이터. 좌표도 예시이며 실제 상권 정보가 아닙니다.
export const sampleRestaurants = [
 ['오늘한상','korean','🍚',37.5485,126.7233,[['제육덮밥',7500],['김치찌개',8000]]],
 ['면이랑','noodle','🍜',37.5478,126.724,[['돈코츠라멘',8500],['덮밥',9000]]],
 ['소담분식','snack','🍢',37.5471,126.7242,[['떡볶이 세트',5500],['김밥',3500],['라면',4500]]],
 ['마라소풍','chinese','🥟',37.5462,126.725,[['마라탕',9000],['꿔바로우',15000]]],
 ['파스타하우스','western','🍝',37.5452,126.7258,[['크림파스타',11000],['토마토파스타',11500]]],
 ['카페 모모','cafe','☕',37.5488,126.7228,[['샌드위치',6000],['아메리카노',3500]]],
 ['김치마을','korean','🍲',37.5445,126.7255,[['김치찌개',6500],['비빔밥',7000]]]
].map(([name,category,emoji,lat,lng,menus],i)=>({id:i+1,name,category,emoji,lat,lng,address:'학교 인근 · 예시 주소',isSample:true,menus:menus.map(([name,price],j)=>({id:(i+1)*10+j,name,price}))}));
export const initialData = () => ({users:[],sessions:[],restaurants:structuredClone(sampleRestaurants),reviews:[],favorites:[],recentViews:[]});
