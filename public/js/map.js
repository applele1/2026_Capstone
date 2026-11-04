import {request} from './api.js';
let map,settings;
// 카카오맵 확대 레벨: 3 = 축척 50m (4 = 100m, 2 = 30m). 학교를 중심으로 50m 기준으로 보여줍니다.
const MAP_LEVEL=3;
export async function initializeMap(onSelect){const container=document.querySelector('#kakaoMap');function unavailable(text){container.replaceChildren();const box=document.createElement('div');box.className='map-empty';const title=document.createElement('b');title.textContent='학교 주변 지도';const p=document.createElement('p');p.textContent=text;box.append(title,p);container.append(box);}
 try{settings=await request('/map/config');if(!settings.jsKey){unavailable('카카오맵 키 설정 후 실제 지도에서 식당 위치를 볼 수 있어요.');return;}
 // ===== 카카오맵 JavaScript 키는 .env의 KAKAO_MAP_JS_KEY에 입력 =====
 await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(settings.jsKey)}&autoload=false`;const timer=setTimeout(()=>reject(new Error('지도 응답 지연')),12000);script.onload=()=>{if(!window.kakao?.maps)return reject(new Error('지도 SDK 오류'));window.kakao.maps.load(()=>{clearTimeout(timer);resolve();});};script.onerror=()=>{clearTimeout(timer);reject(new Error('지도 SDK 오류'));};document.head.append(script);});
 container.replaceChildren();map=new window.kakao.maps.Map(container,{center:new window.kakao.maps.LatLng(settings.school.lat,settings.school.lng),level:MAP_LEVEL});const schoolMarker=new window.kakao.maps.Marker({map,position:new window.kakao.maps.LatLng(settings.school.lat,settings.school.lng)});const label=document.createElement('div');label.textContent=settings.school.name;label.style.padding='8px';new window.kakao.maps.InfoWindow({map,position:schoolMarker.getPosition(),content:label});map.addControl(new window.kakao.maps.ZoomControl(),window.kakao.maps.ControlPosition.RIGHT);window.addEventListener('resize',()=>map.relayout());map.onSelect=onSelect;
 }catch{unavailable('지도를 불러오지 못했어요. 네트워크, JavaScript 키와 등록 도메인을 확인해 주세요.');}
}
// 식당 마커는 항상 1개만 표시합니다. 다른 식당을 고르면 같은 마커가 그 위치로 옮겨갑니다.
let marker=null,info=null,currentId=null;
export function showRestaurant(row){if(!map||!row)return false;const kakao=window.kakao;const id=row.restaurantId??row.id;const position=new kakao.maps.LatLng(row.lat,row.lng);
 if(!marker){marker=new kakao.maps.Marker({position});info=new kakao.maps.InfoWindow({removable:false});kakao.maps.event.addListener(marker,'click',()=>info.open(map,marker));}
 const content=document.createElement('button');content.textContent=row.name+(row.isSample?' (예시)':'')+' · 상세 보기';content.style.cssText='padding:8px;background:white;border:0;white-space:nowrap;cursor:pointer';content.addEventListener('click',()=>map.onSelect(id));
 currentId=id;marker.setPosition(position);marker.setTitle(row.name);marker.setMap(map);info.setContent(content);info.open(map,marker);
 if(map.getLevel()!==MAP_LEVEL)map.setLevel(MAP_LEVEL);map.panTo(position);return true;}
export function clearRestaurant(){currentId=null;info?.close();marker?.setMap(null);}
