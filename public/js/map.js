import {request} from './api.js';
let map,settings,handlers={};
// 카카오맵 확대 레벨: 3 = 축척 50m (4 = 100m, 2 = 30m)
const MAP_LEVEL=4;
const markers=new Map();let info=null,selectedId=null;
export async function initializeMap({onMarker,onDetail}){handlers={onMarker,onDetail};const container=document.querySelector('#kakaoMap');function unavailable(text){container.replaceChildren();const box=document.createElement('div');box.className='map-empty';const title=document.createElement('b');title.textContent='학교 주변 지도';const p=document.createElement('p');p.textContent=text;box.append(title,p);container.append(box);}
 try{settings=await request('/map/config');if(!settings.jsKey){unavailable('카카오맵 키 설정 후 실제 지도에서 식당 위치를 볼 수 있어요.');return false;}
 // ===== 카카오맵 JavaScript 키는 .env의 KAKAO_MAP_JS_KEY에 입력 =====
 await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(settings.jsKey)}&autoload=false`;const timer=setTimeout(()=>reject(new Error('지도 응답 지연')),12000);script.onload=()=>{if(!window.kakao?.maps)return reject(new Error('지도 SDK 오류'));window.kakao.maps.load(()=>{clearTimeout(timer);resolve();});};script.onerror=()=>{clearTimeout(timer);reject(new Error('지도 SDK 오류'));};document.head.append(script);});
 const kakao=window.kakao;container.replaceChildren();const school=new kakao.maps.LatLng(settings.school.lat,settings.school.lng);
 map=new kakao.maps.Map(container,{center:school,level:MAP_LEVEL});
 // 학교 위치는 식당 마커와 구분되도록 별 모양 마커와 라벨로 표시합니다.
 const star=new kakao.maps.MarkerImage('https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png',new kakao.maps.Size(24,35));
 new kakao.maps.Marker({map,position:school,image:star,title:settings.school.name,zIndex:1});
 const label=document.createElement('div');label.className='map-school-label';label.textContent='🏫 '+settings.school.name;new kakao.maps.CustomOverlay({map,position:school,content:label,yAnchor:2.4});
 map.addControl(new kakao.maps.ZoomControl(),kakao.maps.ControlPosition.RIGHT);window.addEventListener('resize',()=>map.relayout());
 info=new kakao.maps.InfoWindow({removable:false,zIndex:5});return true;
 }catch{unavailable('지도를 불러오지 못했어요. 네트워크, JavaScript 키와 등록 도메인을 확인해 주세요.');return false;}
}
// 추천 결과의 식당을 모두 마커로 표시합니다. (식당당 마커 1개)
export function setMarkers(rows){if(!map)return;const kakao=window.kakao;info.close();for(const m of markers.values())m.setMap(null);markers.clear();selectedId=null;
 for(const row of rows){const id=row.restaurantId??row.id;if(markers.has(id))continue;const marker=new kakao.maps.Marker({map,position:new kakao.maps.LatLng(row.lat,row.lng),title:row.name});kakao.maps.event.addListener(marker,'click',()=>handlers.onMarker?.(id));markers.set(id,marker);}
}
// 선택한 식당: 이름 말풍선을 열고 지도 중심을 옮깁니다.
export function showRestaurant(row){if(!map||!row)return false;const kakao=window.kakao;const id=row.restaurantId??row.id;let marker=markers.get(id);
 if(!marker){marker=new kakao.maps.Marker({map,position:new kakao.maps.LatLng(row.lat,row.lng),title:row.name});kakao.maps.event.addListener(marker,'click',()=>handlers.onMarker?.(id));markers.set(id,marker);}
 const content=document.createElement('button');content.className='map-info';content.textContent=`${row.name} · 도보 약 ${row.walkMinutes}분 · 상세 보기`;content.addEventListener('click',()=>handlers.onDetail?.(id));
 selectedId=id;info.setContent(content);info.open(map,marker);map.panTo(marker.getPosition());return true;}
export function clearRestaurant(){selectedId=null;info?.close();}
export function relayout(){if(!map)return;map.relayout();const m=markers.get(selectedId);if(m)map.setCenter(m.getPosition());}
export const mapReady=()=>!!map;
