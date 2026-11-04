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

## 추천 알고리즘 (`src/recommend.js`)

1. 카테고리가 일치하고 **예산 이하 메뉴가 1개 이상**인 식당만 남김
2. 학교 좌표(`SCHOOL_LAT`, `SCHOOL_LNG`)와 식당 좌표로 직선거리(하버사인) 계산, 도보 시간 = 거리 ÷ 67m/분
3. 정렬
   - 추천순: 거리 50% + 평점 35% + 가격 여유 15% 가중 점수
   - 거리순 / 평점순(동점이면 후기 수, 거리) / 가격순(예산 내 최저 메뉴가)

## API

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/config` | 카카오 키, 학교 좌표 |
| GET | `/api/restaurants?budget=&category=&sort=` | 추천 목록 (`sort`: recommend, distance, rating, price) |
| GET/POST | `/api/restaurants/:id/reviews` | 후기 조회/등록 |
| POST | `/api/auth/signup`, `/api/auth/login` | 회원가입/로그인 (Supabase Auth) |
| GET | `/api/favorites` | 내 찜 목록 (Bearer 토큰) |
| POST/DELETE | `/api/favorites/:id` | 찜 추가/해제 |
| GET/PATCH | `/api/me` | 내 정보 조회 / 닉네임 변경 (`{ nickname }`) |
| DELETE | `/api/me` | 회원 탈퇴 (`{ password }` 재확인, 찜·후기 함께 삭제) |
| GET | `/api/me/reviews` | 내가 쓴 후기 목록 |
| PATCH/DELETE | `/api/me/reviews/:id` | 내 후기 수정 (`{ rating, content }`) / 삭제 |

`/api/favorites`, `/api/me` 로 시작하는 API와 후기 등록은 로그인 토큰(`Authorization: Bearer ...`)이 필요합니다.

## 마이페이지 (`public/mypage.html`)

로그인하면 상단 메뉴에 **마이페이지**가 나타납니다. 닉네임 변경, 찜한 맛집 확인·해제, 내 후기 수정·삭제, 회원 탈퇴를 할 수 있고 모든 변경은 Supabase에 바로 저장됩니다.

- 닉네임은 Supabase Auth 회원 정보의 `user_metadata.nickname`에 저장됩니다. 바꾸면 그 회원의 `reviews.nickname`도 함께 바뀝니다.
- 후기는 항상 계정 닉네임으로 등록됩니다.
- 탈퇴 시 `auth.users`에서 회원을 지우면 `reviews`, `favorites`가 `on delete cascade`로 함께 삭제됩니다.
