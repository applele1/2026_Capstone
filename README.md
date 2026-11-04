# 밥잇 — MVC 졸업작품 프로젝트

경인여대생을 위한 예산·거리 기반 식사 메뉴 추천 서비스입니다. 제공된 발표 자료, 프로젝트 설명서와 HTML 디자인을 참고했습니다. 기존 로고·주황/갈색 테마를 유지하고 화면을 실제 Express API에 연결했습니다.

## 빠르게 실행하기

Node.js 22 이상을 설치한 뒤 프로젝트 폴더에서 실행하세요.

```bash
npm ci
cp .env.example .env
npm start
```

Windows에서는 `.env.example` 파일을 복사해 `.env`라는 이름으로 저장하세요. 브라우저에서 http://localhost:3000 을 엽니다. 개발 중 자동 재시작은 `npm run dev`입니다. HTML 파일을 직접 열면 API가 작동하지 않습니다.

기본 `STORAGE_MODE=demo`에서는 DB 계정 없이 시작합니다. 회원, 세션, 즐겨찾기, 최근 기록, 후기는 `data/demo.json`에 저장되어 서버 재시작 뒤에도 유지됩니다. 비밀번호는 salt + scrypt 해시, 세션은 무작위 토큰의 SHA-256 해시로 저장하고 브라우저에는 HttpOnly 쿠키를 사용합니다. 데모 모드는 단일 서버 프로세스의 로컬 시연용이며 실제 배포에는 PostgreSQL을 사용하세요. 테스트 데이터 초기화는 서버 종료 후 `data/demo.json`을 삭제하면 됩니다.

## MVC 구조

| 구분 | 위치 | 역할 |
|---|---|---|
| Model | `src/models/` | 사용자·식당·후기·즐겨찾기·최근 기록·세션 저장 및 조회 |
| View | `src/views/index.ejs`, `public/` | 서버 렌더링 화면, 스타일, 브라우저 이벤트 및 API 호출 |
| Controller | `src/controllers/` | 요청 검증, 인증, 검색, 후기와 지도 요청 처리 |
| Routes | `src/routes/api.js` | URL과 컨트롤러 연결 |
| Service | `src/services/` | 추천 점수·거리 계산, 비밀번호 해시 |
| Middleware | `src/middleware/` | 로그인 확인, 동일 출처 쓰기 요청 확인 |
| DB | `prisma/` | PostgreSQL 스키마·초기 마이그레이션·예시 데이터 |

브라우저에 데이터베이스나 REST 키를 넣지 않습니다. View에서 HTTP 요청 → Route → Controller → Model/Service → JSON 응답 순으로 처리합니다. 로그인 UI뿐 아니라 회원가입·인증·회원별 저장 기능도 구현되어 있습니다.

## 구현 기능

- 예산 이하 **개별 메뉴**를 필터링하여 음식 카테고리별 추천
- 추천순 / 직선거리순 / 최저 메뉴 가격순 정렬
- 식당 상세, 전체 메뉴·가격, 회원 후기와 평균 평점
- 회원가입·로그인·로그아웃, 계정별 즐겨찾기와 최근 본 식당 20개
- 계정당 식당별 후기 1개: 다시 작성하면 수정, 평균/개수는 실제 등록 후기에서 계산
- 카카오맵의 학교·추천 식당 마커, 마커 클릭으로 상세 열기
- 서버 전용 카카오 REST 장소 검색 API
- 모바일 메뉴, 반응형 화면, 접근 가능한 네이티브 모달, 로딩·빈 목록·오류 처리

### 추천 알고리즘

1. 선택 카테고리에서 예산 이하 메뉴가 있는 식당만 선택합니다.
2. 해당 식당에서 예산 이하 최저 메뉴 가격을 `price`로 사용합니다.
3. Haversine 공식을 이용해 학교 좌표와 식당 좌표의 **직선거리**를 계산합니다.
4. `score = round(100 × (0.6 × (1 - price / budget) + 0.4 × (1 - min(distance / 1500, 1))))`
5. 점수 내림차순, 동점이면 거리 오름차순으로 추천합니다.

학교 기준이며 GPS 현재 위치나 도보 경로 API는 사용하지 않습니다. 가격/거리 비중과 1,500m 정규화 범위는 `src/services/recommendation.js`에서 변경할 수 있습니다. 학교 좌표는 `.env`에서 보정하세요. 카페 음료도 메뉴로 취급하므로 예산 추천에 포함됩니다.

## 카카오맵 키를 넣을 위치

**`.env.example`을 복사한 `.env`의 아래 두 항목에 입력합니다.**

```dotenv
# 브라우저 지도 전용 JavaScript 키
KAKAO_MAP_JS_KEY=여기에_JavaScript_키_입력
# 서버 장소 검색 전용 REST API 키
KAKAO_REST_API_KEY=여기에_REST_API_키_입력
```

설정 후 서버를 재시작하세요.

- 카카오 개발자 앱에서 지도 사용 설정과 키를 확인하고 실제 접속 도메인(로컬 시연은 `http://localhost:3000`)을 등록하세요. 포트·호스트가 달라지면 해당 주소도 등록해야 합니다.
- JavaScript 키는 지도 SDK 특성상 브라우저에 전달됩니다. REST API 키는 `src/controllers/mapController.js`에서만 사용하며 브라우저에 전달하지 않습니다.
- 지도 로딩 위치: `public/js/map.js`. JavaScript 키 입력 위치를 주석으로 표시했습니다.
- 키가 없거나 SDK 로딩이 실패하면 안내만 표시합니다. 키 입력 전에는 실제 지도 검증이 불가능합니다.
- `/api/map/places?query=경인여자대학교 식당`은 로그인한 사용자만 호출할 수 있습니다. 실시간 결과를 예산 추천 DB에 자동 삽입하지 않습니다.
- 카카오 장소 검색은 위치·주소를 제공하며 **메뉴 가격은 제공하지 않습니다**. 실제 메뉴 가격은 조사해서 별도로 입력해야 합니다.

공식 문서: https://apis.map.kakao.com/web/guide/ 및 https://developers.kakao.com/docs/ko/local/dev-guide

## Supabase PostgreSQL 연결

1. Supabase 프로젝트의 DB 연결 정보를 확인합니다. 서버 연결용 `DATABASE_URL`, 마이그레이션용 `DIRECT_URL`을 준비합니다. Supabase anon/service role API 키가 아니라 **PostgreSQL 연결 문자열**입니다.
2. `.env`를 설정합니다. 비밀번호에 특수문자가 있으면 URL 인코딩합니다.

```dotenv
STORAGE_MODE=postgres
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require"
```

3. 실행합니다.

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
npm start
```

`db:deploy`는 포함된 초기 마이그레이션을 적용합니다. 이후 스키마 개발 변경은 `npm run db:migrate -- --name 변경이름`으로 새 마이그레이션을 만드세요. `npm run db:studio`에서 식당/메뉴를 편집할 수 있습니다. DB 비밀번호와 `.env`를 Git에 올리지 마세요. 데모 JSON 데이터를 PostgreSQL로 자동 이전하지는 않습니다.

시드는 기존 동일 ID 식당을 덮어쓰지 않고 예시 식당을 추가합니다. 실제 상권으로 바꿀 때는 예시 레코드를 지우고 실제 이름·주소·좌표·카테고리·메뉴/가격을 입력한 뒤 `isSample=false`로 설정하세요. 첫 시드는 빈 졸업작품 DB에서 실행하는 것을 권장합니다. 운영 사용 전 가격을 직접 확인하세요. DB 권한은 서버 계정으로 제한하고 HTTPS에서 운영하세요. `NODE_ENV=production`이면 세션 쿠키는 HTTPS에서만 전달됩니다.

## API

| Method | 경로 | 설명 | 로그인 |
|---|---|---|---|
| POST | `/api/auth/signup` | `{email,password,name}` 회원가입 | 아니오 |
| POST | `/api/auth/login` | `{email,password}` 로그인 | 아니오 |
| POST | `/api/auth/logout` | `{}` 로그아웃 | 아니오 |
| GET | `/api/auth/me` | 현재 계정 | 아니오 |
| GET | `/api/restaurants?budget=10000&category=all&sort=recommend` | 추천 목록 | 아니오 |
| GET | `/api/restaurants/:id` | 상세와 후기, 로그인 시 최근 기록 | 아니오 |
| PUT | `/api/restaurants/:id/favorite` | `{saved:true}` 추가 / `{saved:false}` 해제 | 예 |
| POST | `/api/restaurants/:id/reviews` | `{rating:5,comment:"후기"}` 저장/수정 | 예 |
| GET | `/api/me/favorites` | 내 찜 목록 | 예 |
| GET | `/api/me/recent` | 내 최근 목록 | 예 |
| GET | `/api/map/config` | 지도용 JavaScript 키와 학교 좌표 | 아니오 |
| GET | `/api/map/places?query=식당` | 카카오 장소 조회 | 예 |

쓰기 요청은 `Content-Type: application/json`이 필요합니다. 로그인/회원가입 요청과 외부 장소 API에 호출 제한이 적용됩니다. category는 `all/korean/japanese/chinese/snack/western/cafe`, sort는 `recommend/distance/price`입니다.

## 검증과 남은 연결 작업

```bash
npm test
```

서버 통합 테스트에서 인증, 접근 제어, 찜 저장, 최근 기록, 후기 수정/평균, 검색 조건 검증, 예산 메뉴 필터, 외부 출처 쓰기 차단을 확인합니다. Prisma 클라이언트 생성, 스키마 검증, 전체 JavaScript 문법 검증을 수행했습니다. 브라우저 실행 환경을 확보하지 못해 실제 렌더링/모바일 조작 확인은 미완료이며 반응형 CSS와 이벤트 코드만 점검했습니다. 실제 Supabase 계정과 카카오 키는 제공되지 않아 라이브 연동은 미검증입니다. 로그인 계정으로 카카오 키 설정 후 마커 위치를 확인하고, 실제 DB에 마이그레이션/시드를 적용한 뒤 같은 사용자 흐름을 다시 확인하세요.

기존 ZIP 식당은 **가상 예시 데이터**이고 좌표도 예시입니다. 원본 데모의 가상 평점/후기 숫자는 사용하지 않습니다. 현재 가격 검증일, 영업시간, 비밀번호 찾기, 관리자 UI, 학교 이메일 인증은 구현 범위에 포함하지 않았습니다.
