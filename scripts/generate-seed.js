// 시드 데이터·SQL 생성기
//   node scripts/generate-seed.js
// 만드는 파일
//   data/seed/bapit-data.json        식당·메뉴·카테고리 + 메뉴 속성·태그 (demo 모드와 prisma/seed.js가 사용)
//   data/seed/bapit-test-users.json  관리자 1명 + 테스트 회원 50명과 행동 기록 (demo 모드가 처음 시작할 때 사용)
//   supabase/01_schema.sql           전체 테이블 (Supabase SQL Editor에 붙여 넣기)
//   supabase/02_seed_catalog.sql     식당 37곳 · 메뉴 495개 · 카테고리 · 메뉴 속성 · 태그
//   supabase/03_seed_test_users.sql  관리자 + 테스트 회원 50명 · 후기 · 찜 · 최근 기록 · 행동 기록
// 같은 시드(SEED)로 실행하면 항상 같은 결과가 나옵니다. (비밀번호 해시의 salt만 매번 달라집니다)
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {attributesOf, TAGS} from './menu-attributes.js';
import {hashPassword} from '../src/services/password.js';
import {isSharedMenu} from '../src/services/recommendation.js';

const root = new URL('../', import.meta.url);
const path = p => new URL(p, root);
const SEED = 20261012;
export const TEST_DOMAIN = 'bapit.test';
export const TEST_PASSWORD = 'test1234!';
export const ADMIN = {email: `admin@${TEST_DOMAIN}`, password: 'admin1234!', name: '밥잇관리자'};

// ---------- 1) 카탈로그 + 메뉴 속성 ----------
const data = JSON.parse(await readFile(path('data/seed/bapit-data.json'), 'utf8'));
const catName = new Map(data.categories.map(c => [c.id, c.name]));
const menuCats = new Map();
for (const [m, c] of data.menuCategories) {
  if (!menuCats.has(m)) menuCats.set(m, []);
  menuCats.get(m).push(c);
}
const tags = TAGS.map((name, i) => ({id: i + 1, name}));
const tagId = new Map(tags.map(t => [t.name, t.id]));
const menuTags = [];
data.menus = data.menus.map(m => {
  const {
    tags: t,
    spicy_level,
    portion_level,
    is_rice,
    is_noodle,
    is_soup,
    is_meat
  } = attributesOf(
    m,
    (menuCats.get(m.id) || []).map(id => catName.get(id))
  );
  for (const name of t) menuTags.push([m.id, tagId.get(name)]);
  return {
    id: m.id,
    restaurantId: m.restaurantId,
    name: m.name,
    price: m.price,
    spicyLevel: spicy_level,
    portionLevel: portion_level,
    isRice: is_rice,
    isNoodle: is_noodle,
    isSoup: is_soup,
    isMeat: is_meat
  };
});
data.tags = tags;
data.menuTags = menuTags;
await writeFile(path('data/seed/bapit-data.json'), JSON.stringify(data, null, 1));

// ---------- 2) 테스트 회원 50명 ----------
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = list => list[Math.floor(rand() * list.length)];
const weighted = (items, w) => {
  const total = w.reduce((s, x) => s + x, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= w[i];
    if (r <= 0) return items[i];
  }
  return items.at(-1);
};

const menuInfo = data.menus.map(m => ({
  ...m,
  cats: (menuCats.get(m.id) || []).map(id => catName.get(id)),
  tagSet: new Set(menuTags.filter(x => x[0] === m.id).map(x => tags[x[1] - 1].name))
}));
const soloMenus = menuInfo.filter(m => !isSharedMenu(m.name));
// 취향 유형: 메뉴마다 -1 ~ 1 정도의 선호 점수를 줍니다.
const PERSONAS = [
  {
    key: 'spicy',
    label: '매운맛 러버',
    f: m => (m.spicyLevel >= 2 ? 1 : m.spicyLevel === 1 ? 0.3 : -0.4),
    note: '맵기가 딱 좋아요.'
  },
  {key: 'noodle', label: '면 요리 러버', f: m => (m.isNoodle ? 1 : -0.2), note: '면이 쫄깃해요.'},
  {key: 'soup', label: '국물파', f: m => (m.isSoup ? 1 : -0.2), note: '국물이 진하고 뜨끈해요.'},
  {
    key: 'meat',
    label: '고기 든든파',
    f: m => (m.isMeat ? 0.7 : -0.3) + (m.portionLevel === 3 ? 0.3 : 0),
    note: '고기가 넉넉하게 들어 있어요.'
  },
  {
    key: 'light',
    label: '가볍게 건강식',
    f: m => (m.portionLevel === 1 ? 0.6 : m.portionLevel === 3 ? -0.5 : 0) + (m.tagSet.has('건강한') ? 0.5 : 0),
    note: '부담 없이 먹기 좋아요.'
  },
  {
    key: 'japanese',
    label: '일식·덮밥파',
    f: m => (m.cats.includes('일식') || m.cats.includes('덮밥') ? 0.8 : -0.2) + (m.tagSet.has('해산물') ? 0.2 : 0),
    note: '밥이랑 토핑 조합이 좋아요.'
  },
  {key: 'chinese', label: '중식파', f: m => (m.cats.includes('중식') ? 1 : -0.2), note: '불맛이 살아 있어요.'},
  {
    key: 'fastfood',
    label: '패스트푸드파',
    f: m => (m.cats.includes('패스트푸드') ? 1 : -0.2),
    note: '빨리 나와서 공강 때 좋아요.'
  },
  {
    key: 'bunsik',
    label: '분식·가성비파',
    f: m => (m.cats.includes('분식') ? 0.7 : -0.1) + (m.price <= 6000 ? 0.4 : 0),
    note: '가격이 착해요.'
  },
  {key: 'seafood', label: '해산물파', f: m => (m.tagSet.has('해산물') ? 1 : -0.2), note: '해산물이 신선해요.'}
];
const NAMES = [
  '서연',
  '지우',
  '하은',
  '민서',
  '수아',
  '지민',
  '서윤',
  '예은',
  '채원',
  '윤서',
  '다은',
  '소윤',
  '지유',
  '유진',
  '하린',
  '예린',
  '수빈',
  '가은',
  '지아',
  '나연',
  '예서',
  '은서',
  '시은',
  '다인',
  '서현',
  '민지',
  '유나',
  '채은',
  '아린',
  '하윤',
  '지원',
  '수민',
  '서아',
  '예나',
  '도연',
  '주아',
  '연우',
  '세아',
  '은채',
  '다연',
  '소은',
  '지안',
  '나은',
  '하연',
  '로아',
  '시아',
  '가윤',
  '예지',
  '수연',
  '윤아'
];
const COMMENTS = {
  5: [
    '{menu} 진짜 맛있어요! 또 갈 거예요.',
    '{menu} 강추해요. 양도 넉넉해요.',
    '학교 앞에서 {menu} 먹을 땐 여기가 최고예요.',
    '가격 대비 만족도 최고! {menu} 추천합니다.'
  ],
  4: [
    '{menu} 맛있어요. 점심시간엔 조금 기다려요.',
    '무난하게 맛있어요. {menu} 괜찮았어요.',
    '{menu} 좋았어요. 다음엔 다른 메뉴도 먹어 볼래요.'
  ],
  3: [
    '{menu}는 평범했어요.',
    '나쁘지 않은데 특별하진 않아요. {menu} 먹었어요.',
    '양은 괜찮은데 {menu} 간이 조금 셌어요.'
  ],
  2: ['{menu} 기대보다 아쉬웠어요.', '대기 시간이 길고 {menu}가 조금 식어서 나왔어요.'],
  1: ['{menu} 제 입맛에는 안 맞았어요.']
};
const DAY = 1440;
const users = [{id: 1, ...ADMIN, role: 'admin', persona: null, ago: 90 * DAY}];
const interactions = [],
  favorites = [],
  recentViews = [],
  reviews = [];
for (let i = 0; i < 50; i++) {
  const id = i + 2,
    primary = PERSONAS[i % PERSONAS.length];
  let secondary = pick(PERSONAS);
  if (secondary === primary) secondary = PERSONAS[(i + 3) % PERSONAS.length];
  const aff = m => primary.f(m) + 0.4 * secondary.f(m) - (m.price > 13000 ? 0.4 : 0);
  users.push({
    id,
    email: `user${String(i + 1).padStart(2, '0')}@${TEST_DOMAIN}`,
    password: TEST_PASSWORD,
    name: NAMES[i],
    role: 'user',
    persona: `${primary.label} + ${secondary.label}`,
    ago: int(30, 80) * DAY
  });
  // 행동 기록: 취향에 맞는 메뉴일수록 자주 봅니다. 최근 60일, 최근일수록 많게
  const weights = soloMenus.map(m => Math.exp(3 * aff(m)));
  const count = int(15, 40),
    visits = new Map();
  for (let k = 0; k < count; k++) {
    const m = weighted(soloMenus, weights),
      ago = Math.floor(60 * DAY * rand() ** 1.7) + int(1, 600);
    const type = weighted(['view', 'click', 'recommend_click'], [45, 35, 20]);
    interactions.push({userId: id, restaurantId: m.restaurantId, menuId: type === 'view' ? null : m.id, type, ago});
    const v = visits.get(m.restaurantId) || {n: 0, ago: Infinity, menus: []};
    v.n++;
    v.menus.push(m);
    if (type === 'view') v.ago = Math.min(v.ago, ago);
    visits.set(m.restaurantId, v);
  }
  const ranked = [...visits].sort((a, b) => b[1].n - a[1].n);
  for (const [rid] of ranked.slice(0, int(2, 5)))
    favorites.push({userId: id, restaurantId: rid, ago: int(1, 50) * DAY});
  for (const [rid, v] of visits) if (v.ago < Infinity) recentViews.push({userId: id, restaurantId: rid, ago: v.ago});
  for (const [rid, v] of ranked.slice(0, int(2, 6))) {
    const menu = pick(v.menus),
      r = Math.max(...v.menus.map(aff));
    const rating = Math.min(5, Math.max(1, Math.round(3.5 + 1.3 * r + (rand() - 0.5) * 1.6)));
    let comment = pick(COMMENTS[rating]).replace('{menu}', menu.name);
    if (rating >= 4 && rand() < 0.6) comment += ' ' + primary.note;
    const ago = int(1, 55) * DAY + int(0, 900);
    reviews.push({userId: id, restaurantId: rid, rating, comment, ago, edited: rand() < 0.15});
  }
}
await writeFile(
  path('data/seed/bapit-test-users.json'),
  JSON.stringify(
    {
      note: '데모 모드(STORAGE_MODE=demo)가 data/demo.json을 처음 만들 때 넣는 테스트 계정입니다. ago = 몇 분 전',
      users: await Promise.all(
        users.map(async u => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          persona: u.persona,
          password: await hashPassword(u.password),
          ago: u.ago
        }))
      ),
      reviews: reviews.map((r, i) => ({id: i + 1, ...r})),
      favorites,
      recentViews,
      interactions: interactions.map((x, i) => ({id: i + 1, ...x}))
    },
    null,
    1
  )
);

// ---------- 3) SQL ----------
const q = v =>
  v === null || v === undefined
    ? 'NULL'
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : `'${String(v).replace(/'/g, "''")}'`;
const rows = (list, f, per = 1) =>
  list
    .map(f)
    .map((r, i) => (i % per === 0 ? '\n  ' : ' ') + `(${r.map(q).join(', ')})`)
    .join(',');
const mins = m => `${m} minutes`;
const header = (title, lines) =>
  `-- ===== ${title} =====\n${lines.map(l => '-- ' + l).join('\n')}\n-- (scripts/generate-seed.js가 만든 파일입니다. 직접 고치기보다 스크립트를 고쳐 다시 만드세요.)\n\n`;

await mkdir(path('supabase'), {recursive: true});
const base = await readFile(path('scripts/base-schema.sql'), 'utf8');
const delta = await readFile(path('prisma/migrations/20261012000000_deep_recommendation/migration.sql'), 'utf8');
await writeFile(
  path('supabase/01_schema.sql'),
  header('밥잇 전체 테이블', [
    'Supabase 대시보드 → SQL Editor → 새 쿼리에 전체를 붙여 넣고 Run.',
    '처음 만드는 DB와 이미 테이블이 있는 DB 모두에서 실행할 수 있습니다. (여러 번 실행해도 안전)',
    '실행 순서: 01_schema.sql → 02_seed_catalog.sql → 03_seed_test_users.sql'
  ]) +
    'BEGIN;\n\n' +
    base +
    '\n' +
    delta +
    '\nCOMMIT;\n'
);

const R = data.restaurants,
  C = data.categories,
  M = data.menus;
await writeFile(
  path('supabase/02_seed_catalog.sql'),
  header('식당 · 메뉴 · 카테고리 · 메뉴 속성 · 태그', [
    `2026-10-08 조사 엑셀: 식당 ${R.length}곳 · 메뉴 ${M.length}개 · 카테고리 ${C.length}개 · 메뉴-카테고리 ${data.menuCategories.length}개`,
    '이미 같은 id가 있으면 기본 정보(이름·가격)는 덮어쓰지 않고, 추천용 속성(맵기·양·밥/면/국물/고기·태그)만 갱신합니다.',
    '속성은 메뉴 이름 규칙(scripts/menu-attributes.js)으로 자동 생성했습니다. 틀린 값은 menus 테이블에서 직접 고치세요.'
  ]) +
    `BEGIN;

INSERT INTO "categories" ("id", "name") VALUES${rows(C, c => [c.id, c.name], 5)}
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "restaurants" ("id", "name", "address", "lat", "lng") VALUES${rows(R, r => [r.id, r.name, r.address, r.lat, r.lng])}
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "menus" ("id", "restaurant_id", "name", "price", "spicy_level", "portion_level", "is_rice", "is_noodle", "is_soup", "is_meat") VALUES${rows(M, m => [m.id, m.restaurantId, m.name, m.price, m.spicyLevel, m.portionLevel, m.isRice, m.isNoodle, m.isSoup, m.isMeat])}
ON CONFLICT ("id") DO UPDATE SET
  "spicy_level" = EXCLUDED."spicy_level", "portion_level" = EXCLUDED."portion_level",
  "is_rice" = EXCLUDED."is_rice", "is_noodle" = EXCLUDED."is_noodle", "is_soup" = EXCLUDED."is_soup", "is_meat" = EXCLUDED."is_meat";

INSERT INTO "menu_categories" ("menu_id", "category_id") VALUES${rows(data.menuCategories, x => x, 8)}
ON CONFLICT DO NOTHING;

INSERT INTO "tags" ("id", "name") VALUES${rows(tags, t => [t.id, t.name], 7)}
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name";

-- 메뉴 태그는 생성 규칙 결과로 다시 채웁니다.
DELETE FROM "menu_tags" WHERE "menu_id" IN (${M.map(m => m.id)
      .join(',')
      .replace(/(([^,]*,){40})/g, '$1\n  ')});
INSERT INTO "menu_tags" ("menu_id", "tag_id") VALUES${rows(menuTags, x => x, 8)}
ON CONFLICT DO NOTHING;

-- id를 직접 넣었으므로 다음 자동 번호를 최댓값 뒤로 맞춥니다.
SELECT setval(pg_get_serial_sequence('"restaurants"', 'id'), (SELECT MAX("id") FROM "restaurants"));
SELECT setval(pg_get_serial_sequence('"menus"', 'id'), (SELECT MAX("id") FROM "menus"));
SELECT setval(pg_get_serial_sequence('"categories"', 'id'), (SELECT MAX("id") FROM "categories"));
SELECT setval(pg_get_serial_sequence('"tags"', 'id'), (SELECT MAX("id") FROM "tags"));

COMMIT;
`
);

const seedUsers = JSON.parse(await readFile(path('data/seed/bapit-test-users.json'), 'utf8')).users;
const email = new Map(users.map(u => [u.id, u.email]));
await writeFile(
  path('supabase/03_seed_test_users.sql'),
  header('관리자 + 테스트 회원 50명', [
    `관리자: ${ADMIN.email} / ${ADMIN.password}`,
    `테스트 회원: user01@${TEST_DOMAIN} ~ user50@${TEST_DOMAIN} / ${TEST_PASSWORD}`,
    '⚠️ 실제 서비스 공개 전에는 이 계정들을 지우거나 관리자 비밀번호를 바꾸세요.',
    `   지우기: DELETE FROM "User" WHERE "email" LIKE '%@${TEST_DOMAIN}';  (후기·찜·기록도 함께 삭제)`,
    `다시 실행하면 @${TEST_DOMAIN} 계정과 그 기록을 지우고 새로 만듭니다. 시간은 실행 시점 기준 "몇 분 전"으로 들어갑니다.`,
    `후기 ${reviews.length}개 · 찜 ${favorites.length}개 · 최근 본 식당 ${recentViews.length}개 · 행동 기록 ${interactions.length}개`
  ]) +
    `BEGIN;

DELETE FROM "User" WHERE "email" LIKE '%@${TEST_DOMAIN}';

-- 비밀번호는 앱과 같은 scrypt 해시(salt:hash)입니다.
INSERT INTO "User" ("email", "password", "name", "role", "created_at") VALUES${seedUsers.map(u => `\n  (${[u.email, u.password, u.name, u.role].map(q).join(', ')}, now() - interval '${mins(u.ago)}')`).join(',')};

INSERT INTO "Review" ("user_id", "restaurant_id", "rating", "comment", "created_at", "updated_at")
SELECT u."id", v.restaurant_id, v.rating, v.comment, now() - v.ago::interval,
       CASE WHEN v.edited THEN now() - v.ago::interval + interval '2 days' END
FROM (VALUES${rows(reviews, r => [email.get(r.userId), r.restaurantId, r.rating, r.comment, mins(r.ago), r.edited])}
) AS v(email, restaurant_id, rating, comment, ago, edited)
JOIN "User" u ON u."email" = v.email;

INSERT INTO "Favorite" ("user_id", "restaurant_id", "created_at")
SELECT u."id", v.restaurant_id, now() - v.ago::interval
FROM (VALUES${rows(favorites, r => [email.get(r.userId), r.restaurantId, mins(r.ago)], 3)}
) AS v(email, restaurant_id, ago)
JOIN "User" u ON u."email" = v.email;

INSERT INTO "RecentView" ("user_id", "restaurant_id", "viewed_at")
SELECT u."id", v.restaurant_id, now() - v.ago::interval
FROM (VALUES${rows(recentViews, r => [email.get(r.userId), r.restaurantId, mins(r.ago)], 3)}
) AS v(email, restaurant_id, ago)
JOIN "User" u ON u."email" = v.email;

INSERT INTO "user_menu_interactions" ("user_id", "restaurant_id", "menu_id", "type", "created_at")
SELECT u."id", v.restaurant_id, v.menu_id, v.type, now() - v.ago::interval
FROM (VALUES${rows(interactions, r => [email.get(r.userId), r.restaurantId, r.menuId === null ? null : r.menuId, r.type, mins(r.ago)], 2)}
) AS v(email, restaurant_id, menu_id, type, ago)
JOIN "User" u ON u."email" = v.email;

COMMIT;

-- 확인: SELECT "role", count(*) FROM "User" GROUP BY "role";
`
);

console.log(
  `완료: 메뉴 ${M.length}개 속성 · 태그 ${menuTags.length}개 · 회원 ${users.length}명 · 후기 ${reviews.length} · 찜 ${favorites.length} · 최근 ${recentViews.length} · 행동 ${interactions.length}`
);
