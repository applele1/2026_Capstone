import {config} from '../config.js';
export const mapConfig = (req, res) =>
  res.json({jsKey: config.kakaoJsKey, school: config.school, storage: config.storage});
// REST 키는 이 서버 요청에서만 사용합니다. 응답이나 브라우저 JS에 넣지 않습니다.
export async function searchPlaces(req, res) {
  if (!config.kakaoRestKey) return res.status(503).json({message: '.env의 KAKAO_REST_API_KEY를 설정해 주세요.'});
  const query = String(req.query.query || '경인여자대학교 식당').trim();
  if (query.length < 2 || query.length > 80) return res.status(400).json({message: '검색어는 2~80자로 입력해 주세요.'});
  let response;
  try {
    const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    url.search = new URLSearchParams({
      query,
      x: String(config.school.lng),
      y: String(config.school.lat),
      radius: '1500',
      category_group_code: 'FD6',
      sort: 'distance'
    });
    response = await fetch(url, {
      headers: {Authorization: `KakaoAK ${config.kakaoRestKey}`},
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    return res.status(502).json({message: '카카오 장소 검색에 연결하지 못했습니다.'});
  }
  if (!response.ok) return res.status(502).json({message: '카카오 키와 API 설정을 확인해 주세요.'});
  const payload = await response.json();
  res.json({
    places: payload.documents.map(p => ({
      id: p.id,
      name: p.place_name,
      address: p.road_address_name || p.address_name,
      lat: Number(p.y),
      lng: Number(p.x),
      distance: Number(p.distance),
      url: p.place_url
    })),
    message: '장소 검색에는 메뉴 가격이 없습니다. 실제 가격은 별도로 조사해 DB에 등록해야 합니다.'
  });
}
