# 밥잇 — MVC 졸업작품 프로젝트

경인여대생을 위한 예산·거리 기반 식사 메뉴 추천 서비스입니다. 학교 앞 실제 식당 37곳, 메뉴 495개(2026-10-08 조사)를 기준으로 예산 안에서 먹을 수 있는 메뉴를 추천합니다.

## 빠르게 실행하기

Node.js 22 이상을 설치한 뒤 프로젝트 폴더에서 실행하세요.

```bash
npm ci
cp .env.example .env
npm start
```

Windows에서는 `.env.example` 파일을 복사해 `.env`라는 이름으로 저장하세요. 브라우저에서 http://localhost:3000 을 엽니다. 개발 중 자동 재시작은 `npm run dev`입니다. HTML 파일을 직접 열면 API가 작동하지 않습니다.

- `STORAGE_MODE=demo`: DB 없이 실행합니다. 식당·메뉴는 `data/seed/bapit-data.json`(엑셀에서 옮긴 실제 데이터)을 읽고, 회원·세션·찜·최근 기록·후기만 `data/demo.json`에 저장합니다. 초기화하려면 서버를 끄고 `data/demo.json`을 삭제하세요.
- `STORAGE_MODE=postgres`: Supabase PostgreSQL을 사용합니다. 아래 **Supabase 연결**을 보세요.

> ⚠️ `.env`에는 DB 비밀번호와 카카오 키가 들어 있습니다. **Git에 올리거나 zip으로 공유하지 마세요.** 키는 `.env.example`이 아니라 `.env`에만 적습니다. 이미 공유한 적이 있다면 Supabase DB 비밀번호와 카카오 REST 키를 재발급하세요.

## MVC 구조

| 구분 | 위치 | 역할 |
|---|---|---|
| Model | `src/models/` | 식당·메뉴·카테고리 조회, 회원·세션·후기·찜·최근 기록 저장 |
| View | `src/views/index.ejs`, `src/views/privacy.ejs`, `public/` | 서버 렌더링 화면(카테고리 버튼은 DB에서 생성), 스타일, 브라우저 이벤트 |
| Controller | `src/controllers/` | 요청 검증, 인증·계정, 검색, 후기, 지도 요청 처리 |
| Routes | `src/routes/api.js` | URL과 컨트롤러 연결, 호출 횟수 제한 |
| Service | `src/services/` | 추천 점수·도보 시간 계산, 비밀번호 해시 |
| Middleware | `src/middleware/` | 로그인 확인, 동일 출처 쓰기 요청 확인 |
| DB | `prisma/`, `data/seed/` | PostgreSQL 스키마·마이그레이션·시드 데이터 |

## 데이터 구조 (엑셀과 동일)

| 테이블 | 열 | 설명 |
|---|---|---|
| `restaurants` | id, name, address, lat, lng | 식당 |
| `menus` | id, restaurant_id, name, price | 메뉴 (1인 가격) |
| `categories` | id, name | 한식·면·덮밥·일식·중식·분식·패스트푸드·샐러드&포케·양식 |
| `menu_categories` | menu_id, category_id | 메뉴 ↔ 카테고리 (한 메뉴가 여러 카테고리 가능) |

회원 테이블: `User`, `Session`, `Review`(created_at, updated_at), `Favorite`, `RecentView`.

카테고리는 **메뉴 단위**입니다. 예를 들어 막뚱이김밥의 치즈돈까스는 '일식', 김밥은 '분식'으로 각각 검색됩니다. 화면의 카테고리 버튼은 `categories` 테이블에서 만들어지므로 카테고리를 추가하면 버튼도 자동으로 생깁니다(아이콘은 `src/services/recommendation.js`의 `EMOJI`에 추가).

## 구현 기능

- 예산 이하 **개별 메뉴** 추천, 메뉴 단위 카테고리 필터, **메뉴·식당 이름 검색**
- 추천순 / 거리순 / 가격순(식당마다 가장 싼 메뉴) 정렬, **🎲 오늘 뭐 먹지?** 랜덤 추천
- **도보 예상 시간** 표시 (직선거리 × 1.3 ÷ 분당 67m)
- 카카오맵에 **추천 식당 전체 마커**, 카드 ↔ 마커 서로 선택, 모바일은 **목록/지도 탭**
- **상세+후기 한 창**: 전체 메뉴·가격(예산 초과 흐리게, 여럿이 먹는 메뉴 표시), 찜, 지도 보기, 후기 작성·수정·삭제
- 회원가입(개인정보 수집 동의 필수)·로그인, **내 계정 창**에서 로그아웃·비밀번호 변경·회원 탈퇴
- 계정별 찜과 최근 본 식당 20개, 로그인 전에는 안내 박스 1개만 표시
- 후기: 계정당 식당별 1개, 수정 시 작성일 유지 + '수정됨' 표시, 10분에 10번 저장 제한
- 개인정보 처리방침 페이지(`/privacy`, 연락처는 직접 입력하세요)

### 추천 알고리즘

1. 선택한 카테고리·검색어에 맞고 **예산 이하**인 1인 메뉴만 후보로 사용합니다. `2인`, `(중)`, `(대)`처럼 여럿이 먹는 메뉴는 추천에서 빼고 상세 화면에만 보여줍니다.
2. 가격 적합도 = `1 - |가격 - 예산×0.8| / (예산×0.8)` (0~1). 예산의 80% 정도를 쓰는 메뉴가 가장 높고, 2천원 주먹밥처럼 너무 싸거나 예산에 꽉 차는 메뉴는 낮아집니다.
3. 거리 점수 = `1 - min(직선거리 / 1000m, 1)` (Haversine 공식)
4. `score = round(100 × (0.6 × 가격 적합도 + 0.4 × 거리 점수))`
5. 식당마다 점수가 가장 높은 메뉴 1개를 고르고 점수 내림차순(동점이면 가까운 순)으로 보여줍니다.

비중·기준 거리·도보 속도는 `src/services/recommendation.js` 맨 위 `SETTINGS`에서 바꿀 수 있습니다. 학교 좌표는 `.env`의 `SCHOOL_LAT/SCHOOL_LNG`로 보정하세요. 정문 기준으로 맞추면 도보 시간이 더 정확해집니다.

## 카카오맵 키

`.env`의 아래 두 항목에 입력하고 서버를 재시작합니다.

```dotenv
KAKAO_MAP_JS_KEY=브라우저_지도용_JavaScript_키
KAKAO_REST_API_KEY=서버_장소검색용_REST_API_키
```

- 카카오 개발자 앱에 실제 접속 도메인(로컬은 `http://localhost:3000`)을 등록하세요.
- JavaScript 키는 지도 SDK 특성상 브라우저에 전달됩니다. REST API 키는 `src/controllers/mapController.js`에서만 사용합니다.
- 키가 없거나 SDK 로딩이 실패하면 안내 문구만 표시합니다.

## Supabase PostgreSQL 연결

1. `.env`를 설정합니다. 비밀번호에 특수문자가 있으면 URL 인코딩합니다.

```dotenv
STORAGE_MODE=postgres
DATABASE_URL="postgresql://USER:PASSWORD@HOST:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/postgres"
```

2. 실행합니다.

```bash
npm run db:generate   # Prisma 클라이언트 생성
npm run db:deploy     # 마이그레이션 적용
npm run db:seed       # 엑셀 데이터 넣기 (이미 있는 id는 건너뜀)
npm start
```

`20261011000000_real_restaurant_data` 마이그레이션이 하는 일:

- `restaurants / menus / categories / menu_categories` 테이블이 없으면 만들고, **Supabase에서 직접 만들어 둔 테이블이 있으면 그대로 사용**합니다. id가 int8(bigint)이거나 가격이 numeric이면 Prisma와 맞게 integer/double로 바꾸고(값 유지), 없는 기본 키·외래 키만 추가합니다.
- 예전 예시 식당 테이블(`Restaurant`, `Menu`)과 그 예시 식당에 남은 테스트 후기·찜·최근 기록을 삭제합니다. 예시가 아닌 데이터가 있으면 지우지 않고 `_old_Restaurant`, `_old_Menu`로 보관합니다.
- 후기·찜·최근 기록이 새 `restaurants` 테이블을 가리키도록 외래 키를 바꾸고, `Review.updated_at` 열을 추가합니다.

> `db:deploy`에서 `P3005 (database schema is not empty)` 오류가 나면, 첫 마이그레이션을 이미 적용된 것으로 표시한 뒤 다시 실행하세요: `npx prisma migrate resolve --applied 20261006000000_init` → `npm run db:deploy`

식당·메뉴는 Supabase 테이블 편집기나 `npm run db:studio`에서 수정하면 바로 반영됩니다. 데모 모드용 `data/seed/bapit-data.json`은 2026-10-08 엑셀 스냅샷이라 자동으로 바뀌지 않습니다.

## API

| Method | 경로 | 설명 | 로그인 |
|---|---|---|---|
| POST | `/api/auth/signup` | `{email,password,name,agree:true}` 회원가입 | 아니오 |
| POST | `/api/auth/login` | `{email,password}` 로그인 | 아니오 |
| POST | `/api/auth/logout` | `{}` 로그아웃 | 아니오 |
| GET | `/api/auth/me` | 현재 계정 | 아니오 |
| PUT | `/api/auth/password` | `{currentPassword,newPassword}` 비밀번호 변경 (다른 기기 로그아웃) | 예 |
| DELETE | `/api/auth/account` | `{password}` 회원 탈퇴 (모든 기록 삭제) | 예 |
| GET | `/api/categories` | 카테고리 목록 | 아니오 |
| GET | `/api/restaurants?budget=10000&category=all&sort=recommend&q=` | 추천 목록 | 아니오 |
| GET | `/api/restaurants/:id` | 상세(전체 메뉴)·후기, 로그인 시 최근 기록 | 아니오 |
| PUT | `/api/restaurants/:id/favorite` | `{saved:true/false}` 찜 추가/해제 | 예 |
| POST | `/api/restaurants/:id/reviews` | `{rating:5,comment:"후기"}` 저장/수정 | 예 |
| DELETE | `/api/restaurants/:id/reviews` | `{}` 내 후기 삭제 | 예 |
| GET | `/api/me/favorites` | 내 찜 목록 | 예 |
| GET | `/api/me/recent` | 내 최근 목록 | 예 |
| GET | `/api/map/config` | 지도용 JavaScript 키와 학교 좌표 | 아니오 |
| GET | `/api/map/places?query=식당` | 카카오 장소 조회 | 예 |

쓰기 요청은 `Content-Type: application/json`이 필요합니다. `category`는 `all` 또는 `categories.id`, `sort`는 `recommend/distance/price`, `q`는 30자 이내입니다.

## 검증

```bash
npm test
```

추천 공식·여럿이 먹는 메뉴 제외·검색, 실제 데이터 사용(예시 식당 정리), 회원가입 동의·찜·최근 기록·후기 수정/삭제·비밀번호 변경·탈퇴, 입력 검증, 저장소 재시작 후 유지까지 확인합니다.

## 아직 남은 일

- 영업시간·휴무일: 엑셀 데이터에 없어 구현하지 않았습니다. `restaurants`에 열을 추가하면 '영업 중만 보기' 필터를 붙일 수 있습니다.
- 비밀번호 찾기(이메일 발송), 학교 이메일 인증, 관리자 화면
- 개인정보 처리방침의 문의 연락처 입력
