import 'dotenv/config';
import path from 'node:path';
export const config = {
  port: Number(process.env.PORT || 3000),
  production: process.env.NODE_ENV === 'production',
  storage: process.env.STORAGE_MODE || 'demo',
  dataPath: path.resolve(process.env.DEMO_DATA_PATH || './data/demo.json'),
  // demo 모드에서 data/demo.json을 새로 만들 때 테스트 계정(관리자 1 + 회원 50)을 넣을지 여부
  demoTestUsers: process.env.DEMO_TEST_USERS !== 'false',
  kakaoJsKey: process.env.KAKAO_MAP_JS_KEY || '',
  kakaoRestKey: process.env.KAKAO_REST_API_KEY || '',
  school: {
    name: '경인여자대학교',
    lat: Number(process.env.SCHOOL_LAT || 37.5505),
    lng: Number(process.env.SCHOOL_LNG || 126.7223)
  }
};
if (!['demo', 'postgres'].includes(config.storage)) throw new Error('STORAGE_MODE는 demo 또는 postgres여야 합니다.');
