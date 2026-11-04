# 밥잇 수정 기록

## 2026-10-12 마이페이지 (회원 정보 관리)

### 한눈에 보기

- 로그인하면 상단 메뉴에 **마이페이지**(`mypage.html`)가 생깁니다.
- 마이페이지에서 닉네임 변경, 찜한 맛집 확인·해제, 내 후기 수정·삭제, 회원 탈퇴를 할 수 있습니다. 모두 Supabase와 연동됩니다.
- 닉네임은 Supabase Auth 회원 정보(`user_metadata.nickname`)에 저장합니다. **표를 새로 만들거나 SQL을 실행할 필요가 없습니다.** 가입 시 기본 닉네임은 이메일 `@` 앞부분입니다.
- 후기는 이제 계정 닉네임으로만 등록됩니다. 후기 창의 닉네임 칸은 읽기 전용입니다.
- 탈퇴는 비밀번호를 다시 확인한 뒤 진행하며, 찜과 후기도 함께 삭제됩니다.
- 메인 페이지에서 "STUDENT REVIEWS" 배너와 "HOW IT WORKS" 섹션을 삭제했습니다.

### 바뀐 파일

| 파일 | 바뀐 내용 |
| --- | --- |
| `server.js` | `/api/me`(조회·닉네임 변경·탈퇴), `/api/me/reviews`(목록·수정·삭제) 추가. 후기 검사를 `readReview`로 분리. 후기 등록 시 계정 닉네임 사용. 찜 목록에 주소 포함 |
| `src/db.js` | Supabase·데모 모드 모두에 `updateNickname`, `deleteUser`, `listUserReviews`, `updateReview`, `deleteReview` 추가. 후기 수정·삭제는 `user_id` 조건을 함께 걸어 본인 후기만 바뀜 |
| `public/common.js` (새 파일) | 두 페이지가 같이 쓰는 함수(`api`, `toast`, `escapeHtml`, 로그인 정보 저장 등) |
| `public/mypage.html`, `public/mypage.js` (새 파일) | 마이페이지 화면과 동작 |
| `public/app.js` | 공용 함수를 `common.js`에서 가져오도록 정리. 로그인 시 마이페이지 링크 표시. 페이지를 열 때 최신 닉네임으로 로그인 정보 갱신. 토큰이 만료되면 어느 요청에서든 로그아웃 처리. `index.html#login`으로 들어오면 로그인 창 열기 |
| `public/index.html` | 마이페이지 링크 추가, 후기 닉네임 칸 읽기 전용, 위 두 섹션 삭제 |
| `public/style.css` | 마이페이지 스타일 추가, 삭제한 섹션 스타일 제거 |

### 확인한 것

- Supabase 연결 상태와 데모 모드 각각에서 22개 항목 자동 점검 통과 (다른 회원 후기 수정·삭제 차단, 틀린 비밀번호로 탈퇴 거부, 탈퇴 시 후기 자동 삭제 포함)
- 브라우저에서 닉네임 변경 → 메인 화면·후기에 반영, 후기 수정, 찜 해제, 회원 탈퇴까지 확인
- 테스트로 만든 계정과 데이터는 모두 탈퇴 처리해서 Supabase에 남아 있지 않음

## 2026-10-08 Supabase 연동 및 추천 로직 변경

### 한눈에 보기

- 엑셀 데이터 기준으로 Supabase 표 구조를 새로 정했습니다. (`restaurants`, `menus`, `menu_categories`, `reviews`, `favorites`)
- 카테고리는 식당이 아니라 **메뉴**에 붙습니다. 메뉴 하나가 여러 카테고리를 가질 수 있습니다. (예: 우동 = 일식 + 면)
- 카테고리 버튼: `전체, 한식, 일식, 중식, 분식, 양식, 패스트푸드, 면, 덮밥, 샐러드&포케`
- 추천 결과는 **예산 안에서 가장 저렴하면서 가까운 식당 TOP 3**입니다.
- 후기는 **로그인한 사용자만** 작성할 수 있습니다.

### 바뀐 파일

| 파일 | 바뀐 내용 |
| --- | --- |
| `src/db.js` | Supabase에서 식당을 읽을 때 `menus` → `menu_categories`를 따라가 메뉴별 카테고리를 붙임. 없는 열(`category`, `emoji`, `phone`, `description`) 요청 제거. 식당 대표 카테고리 = 메뉴에 가장 많이 붙은 카테고리 (`withCategories`). 데모 모드도 같은 형태로 맞춤 |
| `src/recommend.js` | 카테고리를 메뉴 단위로 필터링. 추천순 점수 = 가격 50% + 거리 50% (후보끼리 비교해 0~100점). 동점이면 더 싼 곳, 그다음 더 가까운 곳. 모든 정렬에서 상위 3곳만 반환 (`TOP_N`). 좌표가 없는 식당은 제외 |
| `server.js` | 카테고리 목록을 한글 9개로 변경. 후기 등록에 로그인 필수(`requireUser`), `user_id` 항상 저장. 찜 목록 응답의 카테고리를 대표 카테고리로 변경 |
| `public/index.html` | 카테고리 버튼 10개(전체 + 9개)로 교체 |
| `public/style.css` | 카테고리 버튼 배치를 한 줄 5개로 변경 |
| `public/app.js` | 이모지를 카테고리로 정함 (`CATEGORY_EMOJI`). 식당 소개 대신 주소 표시. 비로그인 상태에서 후기 등록 시 로그인 창 표시. 결과 문구를 "추천순 TOP 3 식당이에요" 형태로 변경 |
| `data/seed.js` | 데모 모드 샘플 데이터의 카테고리를 한글 이름으로 변경 (카페 2곳은 `양식`) |
| `supabase/schema.sql` | 실제 Supabase 표 구조(위 5개 표, 인덱스, RLS, `service_role` 권한)로 교체 |
| `.env` | Supabase 주소·secret 키를 `.env.example`에서 옮기고, URL 끝의 `/rest/v1/` 제거. 카카오 JavaScript 키 입력됨 |

### 데이터 파일 (`Downloads` 폴더)

| 파일 | 내용 | Supabase 표 |
| --- | --- | --- |
| `restaurants_1008_no_category.csv` | 식당 35곳 (`id, name, address, lat, lng`) | `restaurants` |
| `menus.csv` | 메뉴 463개 (`id, restaurant_id, name, price`). 엑셀에서 두 줄이던 메뉴 12개는 한 줄로 합침 | `menus` |
| `menu_categories.csv` | 메뉴-카테고리 475줄 (`menu_id, category`) | `menu_categories` |

가져오는 순서: `restaurants` → `menus` → `menu_categories`

### Supabase에서 한 작업

- `restaurants`, `menus`, `menu_categories` 표 생성 및 CSV 가져오기 완료 (35 / 463 / 475행)
- 서버 역할(`service_role`)에 표 권한 부여 (`grant`)

### 남은 일

- [ ] SQL Editor에서 `reviews`, `favorites` 표 만들기 (`supabase/schema.sql` 참고). 없으면 식당 목록이 오류로 끝남
- [ ] 터미널의 `npm start`를 끄고 다시 실행 (수정한 코드 반영)
- [x] 학교 좌표를 경인여대 실제 좌표로 변경 (계양산로 63, `37.5484997, 126.7228094`). `.env`, `server.js`·`public/app.js` 기본값 모두 반영
- [ ] 카카오 개발자 콘솔에 사이트 도메인 `http://localhost:3000` 등록, 카카오맵 사용 설정 ON
- [ ] `.env.example` 파일이 폴더에 없음. 다른 사람과 공유할 때 필요하면 키 값을 비운 견본으로 다시 만들기

### 로고 적용

- `public/assets/bapit-logo.png` 추가: 받은 로고 이미지(1024×1024 JPG)에서 바깥 검은 배경을 투명하게 지우고 256×256 PNG로 저장
- 헤더(44px), 푸터(30px), 로그인 창(64px), 브라우저 탭 아이콘이 모두 이 파일을 사용
- `server.js`에서 임시 SVG 로고로 보내던 경로 삭제

### 주의

- `npm run seed`는 예전 표 구조용이라 실행하지 마세요. 특히 `--force`를 붙이면 넣어 둔 식당·메뉴를 지우고 실패합니다.
- `.env`의 secret 키는 다른 곳에 공유하지 마세요.
