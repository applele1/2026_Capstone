import {request} from './api.js';
// 지도에는 마커를 항상 1개만 표시합니다.
// 처음에는 경인여자대학교에 있다가, 메뉴(카드)를 누르면 그 식당 위치로 옮겨갑니다.
let map,
  settings,
  marker,
  info,
  school,
  onDetail,
  currentId = null;
// 카카오맵 확대 레벨: 3 = 축척 50m (4 = 100m, 2 = 30m)
const MAP_LEVEL = 3;
function label(text, clickable) {
  const el = document.createElement(clickable ? 'button' : 'div');
  el.className = 'map-info';
  el.textContent = text;
  return el;
}
export async function initializeMap({onDetail: openDetail} = {}) {
  onDetail = openDetail;
  const container = document.querySelector('#kakaoMap');
  function unavailable(text) {
    container.replaceChildren();
    const box = document.createElement('div');
    box.className = 'map-empty';
    const title = document.createElement('b');
    title.textContent = '학교 주변 지도';
    const p = document.createElement('p');
    p.textContent = text;
    box.append(title, p);
    container.append(box);
  }
  try {
    settings = await request('/map/config');
    if (!settings.jsKey) {
      unavailable('카카오맵 키 설정 후 실제 지도에서 식당 위치를 볼 수 있어요.');
      return false;
    }
    // ===== 카카오맵 JavaScript 키는 .env의 KAKAO_MAP_JS_KEY에 입력 =====
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(settings.jsKey)}&autoload=false`;
      const timer = setTimeout(() => reject(new Error('지도 응답 지연')), 12000);
      script.onload = () => {
        if (!window.kakao?.maps) return reject(new Error('지도 SDK 오류'));
        window.kakao.maps.load(() => {
          clearTimeout(timer);
          resolve();
        });
      };
      script.onerror = () => {
        clearTimeout(timer);
        reject(new Error('지도 SDK 오류'));
      };
      document.head.append(script);
    });
    const kakao = window.kakao;
    container.replaceChildren();
    school = new kakao.maps.LatLng(settings.school.lat, settings.school.lng);
    map = new kakao.maps.Map(container, {center: school, level: MAP_LEVEL});
    marker = new kakao.maps.Marker({map, position: school, title: settings.school.name});
    info = new kakao.maps.InfoWindow({removable: false, zIndex: 5});
    // 식당을 가리키고 있을 때 마커를 누르면 상세 창을 엽니다.
    kakao.maps.event.addListener(marker, 'click', () => {
      if (currentId != null) onDetail?.(currentId);
    });
    map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
    window.addEventListener('resize', () => map.relayout());
    showSchool();
    return true;
  } catch {
    unavailable('지도를 불러오지 못했어요. 네트워크, JavaScript 키와 등록 도메인을 확인해 주세요.');
    return false;
  }
}
// 마커를 학교 위치로 되돌립니다. (처음 화면, 새로 검색했을 때)
export function showSchool() {
  if (!map) return;
  currentId = null;
  marker.setPosition(school);
  marker.setTitle(settings.school.name);
  info.setContent(label('🏫 ' + settings.school.name));
  info.open(map, marker);
  map.setLevel(MAP_LEVEL);
  map.panTo(school);
}
// 선택한 식당으로 마커를 옮깁니다.
export function showRestaurant(row) {
  if (!map || !row) return false;
  const kakao = window.kakao;
  const id = row.restaurantId ?? row.id;
  const position = new kakao.maps.LatLng(row.lat, row.lng);
  const content = label(`${row.name} · 도보 약 ${row.walkMinutes}분 · 상세 보기`, true);
  content.addEventListener('click', () => onDetail?.(id));
  currentId = id;
  marker.setPosition(position);
  marker.setTitle(row.name);
  info.setContent(content);
  info.open(map, marker);
  map.setLevel(MAP_LEVEL);
  map.panTo(position);
  return true;
}
export function relayout() {
  if (!map) return;
  map.relayout();
  map.setCenter(marker.getPosition());
}
