# 밥잇 (Bapit)

경인여대생을 위한 예산·카테고리·거리 기반 맛집 추천 서비스 (Node.js + Express + Supabase + Kakao Map)

## 실행

```bash
npm install
copy .env.example .env   # 값 채우기
npm start                # http://localhost:3000
```

`.env`에 Supabase 값이 없으면 `data/seed.js` 샘플 데이터로 동작하는 **데모 모드**로 실행됩니다.

## Supabase 연결

1. [supabase.com](https://supabase.com)에서 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 실행
3. Project Settings > API 에서 `Project URL`, `service_role` 키를 `.env`에 입력
4. `npm run seed` 로 샘플 식당/메뉴/후기 등록 (덮어쓰기: `npm run seed -- --force`)
5. 실제 식당 데이터는 Supabase Table Editor에서 `restaurants`, `menus` 테이블에 직접 추가

## Kakao Map 연결

1. [developers.kakao.com](https://developers.kakao.com) > 내 애플리케이션 > 앱 생성
2. 앱 키 > **JavaScript 키**를 `.env`의 `KAKAO_JS_KEY`에 입력
3. 플랫폼 > Web > 사이트 도메인에 `http://localhost:3000` (배포 시 실제 도메인도) 등록
4. 카카오맵 > 사용 설정을 **ON**으로 변경

## 추천 알고리즘 (`src/services/recommend.js`)

1. **필터링**: 예산 이하이면서 고른 카테고리·맵기·특징에 맞는 메뉴가 1개 이상 있고, 도보 시간 조건(10분/15분 이내)을 만족하는 식당만 남김
2. **거리·도보 시간**
   - `restaurants.walk_distance_m`, `walk_minutes`(실제 도보 경로 기준)가 있으면 그 값을 사용
   - 없으면 학교 좌표(`SCHOOL_LAT`, `SCHOOL_LNG`)와 식당 좌표의 직선거리(하버사인)를 계산하고, 도보 시간 = 거리 ÷ 67m/분
3. **추천순 점수** (메뉴마다 계산, 100점 만점)
   - 가격 4 : 취향 일치도 3 : 거리 2 : 평점 1 (= 40% · 30% · 20% · 10%)
   - 가격·거리·평점은 후보들 안에서 최소-최대 정규화해 0~1로 맞춤
   - 취향 일치도 = 고른 항목(카테고리, 맵기, 특징)만 비교한 평균. 고르지 않은 항목은 점수를 깎지 않음
   - 식당에서 점수가 가장 높은 메뉴를 추천 메뉴로, 그 점수를 식당 점수로 사용. 동점이면 더 싼 곳, 그다음 더 가까운 곳
4. **다른 정렬**
   - 거리순 / 평점순(동점이면 후기 수, 거리) / 가격순(조건에 맞는 최저 메뉴 가격)
   - 랜덤 추천: 조건을 무시하고 전체 식당·메뉴를 무작위로 섞음

## API

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/config` | 카카오 키, 학교 좌표 |
| GET | `/api/restaurants?budget=&category=&sort=&spice=&traits=&walk=` | 추천 목록 (`sort`: recommend, distance, rating, price, random) |
| GET/POST | `/api/restaurants/:id/reviews` | 후기 조회/등록 |
| POST | `/api/auth/signup`, `/api/auth/login` | 회원가입/로그인 (Supabase Auth) |
| GET | `/api/favorites` | 내 찜 목록 (Bearer 토큰) |
| POST/DELETE | `/api/favorites/:id` | 찜 추가/해제 |
| GET/PATCH | `/api/me` | 내 정보 조회 / 닉네임 변경 (`{ nickname }`) |
| PATCH | `/api/me/password` | 비밀번호 변경 |
| DELETE | `/api/me` | 회원 탈퇴 (`{ password }` 재확인, 찜·후기 함께 삭제) |
| GET | `/api/me/reviews` | 내가 쓴 후기 목록 |
| PATCH/DELETE | `/api/me/reviews/:id` | 내 후기 수정 (`{ rating, content }`) / 삭제 |

`/api/favorites`, `/api/me` 로 시작하는 API와 후기 등록은 로그인 토큰(`Authorization: Bearer ...`)이 필요합니다.

## 마이페이지 (`public/mypage.html`)

로그인하면 상단 메뉴에 **마이페이지**가 나타납니다. 닉네임 변경, 찜한 맛집 확인·해제, 내 후기 수정·삭제, 회원 탈퇴를 할 수 있고 모든 변경은 Supabase에 바로 저장됩니다.

- 닉네임은 Supabase Auth 회원 정보의 `user_metadata.nickname`에 저장됩니다. 바꾸면 그 회원의 `reviews.nickname`도 함께 바뀝니다.
- 후기는 항상 계정 닉네임으로 등록됩니다.
- 탈퇴 시 `auth.users`에서 회원을 지우면 `reviews`, `favorites`가 `on delete cascade`로 함께 삭제됩니다.
