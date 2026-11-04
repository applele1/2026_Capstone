// ===== 심층 추천 (개인화) =====
// 1) 하드 필터: 예산 · 1인 메뉴 · 카테고리 · 도보 시간 · '안 맵게'
// 2) 점수 = 지금 먹고 싶은 조건 35% + 개인 취향 20% + 가격 15% + 거리 10% + 평점 10% + 인기 5% + 새로움 5%
//    기록이 거의 없는 사용자(콜드 스타트)는 개인 취향 20%를 평점 10% · 인기 10%로 넘깁니다.
// 3) 식당마다 가장 높은 메뉴 1개 → 상위 3개는 서로 다른 종류가 되도록 다양성 보정
import {distanceMeters, walkMinutes, priceFit, distanceScore, isSharedMenu, emojiOf} from './recommendation.js';

export const DEEP_SETTINGS = {
  weights: {condition: 0.35, taste: 0.2, price: 0.15, distance: 0.1, rating: 0.1, popularity: 0.05, novelty: 0.05},
  coldStartSignals: 3, // 행동 신호가 이보다 적으면 개인 취향을 쓰지 않습니다.
  halfLifeDays: 30, // 30일 지난 기록은 절반만 반영
  events: {view: 1, click: 1.5, recommend_click: 2, favorite: 3},
  reviewWeight: 1.5, // 후기: (별점 - 3) × 1.5  → 1~2점 후기는 취향에서 뺍니다.
  noveltyDays: 14, // 14일 안에 본 식당은 '새로움' 점수를 낮춥니다.
  minCondition: 0.5, // 조건을 고르면 절반 이상 맞는 메뉴만 (결과가 3개 미만이면 완화)
  diversityGap: 5, // 상위 3개는 5점 이내라면 다른 종류의 메뉴를 먼저 보여줍니다.
  limit: 10
};

export const FOOD_TYPES = [
  {key: 'rice', label: '밥', emoji: '🍚', test: m => m.isRice, reason: '밥 메뉴'},
  {key: 'noodle', label: '면', emoji: '🍜', test: m => m.isNoodle, reason: '면 요리'},
  {key: 'soup', label: '국물', emoji: '🍲', test: m => m.isSoup, reason: '국물 요리'},
  {key: 'meat', label: '고기', emoji: '🍖', test: m => m.isMeat, reason: '고기 메뉴'},
  // 아래 3개는 DB 열 없이 메뉴·식당 이름으로 판단합니다. (식당을 추가하면 이름 목록에 넣으세요)
  {key: 'salad', label: '샐러드', emoji: '🥗', test: m => /샐러드|포케/.test(m.name), reason: '샐러드·포케'},
  {
    key: 'burger',
    label: '햄버거',
    emoji: '🍔',
    test: m => /맘스터치|롯데리아|버거킹|KFC/.test(m.restaurantName || ''),
    reason: '햄버거'
  },
  {
    key: 'sandwich',
    label: '샌드위치',
    emoji: '🥪',
    test: m => /이삭토스트|써브웨이|서브웨이/.test(m.restaurantName || '') && !/샐러드/.test(m.name),
    reason: '샌드위치·토스트'
  }
];
export const SPICY = [
  {key: 'any', label: '상관없음'},
  {key: 'none', label: '안 맵게', emoji: '🙅'},
  {key: 'mild', label: '살짝 매콤', emoji: '🌶️'},
  {key: 'hot', label: '확 맵게', emoji: '🔥'}
];
export const PORTION = [
  {key: 'any', label: '상관없음'},
  {key: 'light', label: '가볍게', emoji: '🥗'},
  {key: 'heavy', label: '든든하게', emoji: '💪'}
];
// 학교 앞 식당은 도보 6~20분 거리(직선거리 × 1.3)라서 5분 이내는 결과가 없습니다. 식당이 바뀌면 함께 조정하세요.
export const WALK = [0, 10, 15];
const TAG_EMOJI = {뜨끈한: '♨️', 시원한: '🧊', 바삭한: '🍤', 치즈: '🧀', 해산물: '🦐', 건강한: '🌿', 간편한: '⏱️'};
export const tagEmoji = name => TAG_EMOJI[name] || '🏷️';

// ---------- 입력 정리 ----------
const list = v => (Array.isArray(v) ? v : String(v ?? '').split(',')).map(x => String(x).trim()).filter(Boolean);
export function normalizeOptions(raw = {}, {categories = [], tags = []} = {}) {
  const budget = Number(raw.budget ?? 10000);
  const err = m => {
    const e = new Error(m);
    e.status = 400;
    throw e;
  };
  if (!Number.isInteger(budget) || budget < 3000 || budget > 30000) err('예산은 3,000~30,000원 사이로 입력해 주세요.');
  const types = [...new Set(list(raw.types))];
  if (types.some(t => !FOOD_TYPES.some(f => f.key === t))) err('음식 종류를 확인해 주세요.');
  const spicy = String(raw.spicy || 'any'),
    portion = String(raw.portion || 'any'),
    walk = Number(raw.walk || 0);
  if (!SPICY.some(s => s.key === spicy) || !PORTION.some(p => p.key === portion) || !WALK.includes(walk))
    err('검색 조건을 확인해 주세요.');
  const tagIds = [...new Set(list(raw.tags).map(Number))],
    categoryIds = [...new Set(list(raw.categories).map(Number))];
  if (tagIds.some(id => !tags.some(t => t.id === id)) || categoryIds.some(id => !categories.some(c => c.id === id)))
    err('검색 조건을 확인해 주세요.');
  return {budget, types, spicy, portion, walk, tags: tagIds, categories: categoryIds};
}

// ---------- 자연어 → 조건 (AI 없이 키워드 규칙) ----------
// 예: "비도 오고 뜨끈하고 얼큰한 거 만원 안쪽" → 국물 · #뜨끈한 · 확 맵게 · 10,000원
// 한 글자 단어('면', '회')는 '~하면', '회의'처럼 다른 말 속에 자주 섞이므로 앞에 한글이 없을 때만 인정합니다.
const RULES = [
  [/국밥|덮밥|볶음밥|비빔밥|밥(?!\s*말고)|라이스/, o => o.types.add('rice')],
  [
    /국수|라면|라멘|우동|파스타|스파게티|짬뽕|짜장|냉면|칼국수|쫄면|소바|모밀|(?<![가-힣])면(?!\s*말고)/,
    o => o.types.add('noodle')
  ],
  [/국물|탕(?!수)|찌개|얼큰|뜨끈|따뜻|뜨거운|해장/, o => o.types.add('soup')],
  [/고기|삼겹|제육|돈까스|돈가스|치킨|스테이크|불고기/, o => o.types.add('meat')],
  [/뜨끈|따뜻|뜨거운|추워|추운|쌀쌀|비\s*(가|도)?\s*(와|오)|비오/, o => o.tags.add('뜨끈한')],
  [/시원|차가운|냉면|냉모밀|더워|더운|더위/, o => o.tags.add('시원한')],
  [/바삭|튀김|까스|가스/, o => o.tags.add('바삭한')],
  [/치즈/, o => o.tags.add('치즈')],
  [/해산물|해물|초밥|스시|새우|연어|물회|(?<![가-힣])회(?![의사식원장계복전])/, o => o.tags.add('해산물')],
  [
    /건강|다이어트|샐러드|포케|채소|야채/,
    o => {
      o.tags.add('건강한');
      o.portion = o.portion || 'light';
    }
  ],
  [/샐러드|포케/, o => o.types.add('salad')],
  [/햄버거|버거|맘스터치|롯데리아/, o => o.types.add('burger')],
  [/샌드위치|토스트|써브웨이|서브웨이/, o => o.types.add('sandwich')],
  [/간단|간편|빨리|빠르게|급해|공강/, o => o.tags.add('간편한')],
  [
    /가볍|가벼운|적게|조금만|입맛\s*없/,
    o => {
      o.portion = 'light';
    }
  ],
  [
    /든든|배고|많이|푸짐|헤비/,
    o => {
      o.portion = 'heavy';
    }
  ],
  [
    /가까|근처|코앞|멀리\s*가기\s*싫/,
    o => {
      o.walk = 10;
    }
  ],
  [
    /살짝\s*매|약간\s*매|조금\s*매|덜\s*매/,
    o => {
      o.spicy = 'mild';
    }
  ],
  [
    /(안|않|못)\s*(맵|매운|매워)|맵지\s*않|(매운|맵)\S*\s*(거|것|건|음식)?\s*말고|순한|담백|자극적이지\s*않/,
    o => {
      o.spicy = 'none';
    }
  ]
];

const NOT_TYPES = [
  ['rice', /밥\S*\s*말고/],
  ['noodle', /(국수|라면|(?<![가-힣])면)\S*\s*말고/],
  ['soup', /(국물|찌개|탕(?!수))\S*\s*말고/],
  ['meat', /고기\S*\s*말고/]
];

// 금액: "만원", "만 원 안쪽", "1.5만원", "1만5천원", "만오천원", "8천원", "팔천원", "8000원"
const KOR_DIGIT = {일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9};
const D = '(\\d+(?:\\.\\d+)?|[일이삼사오육칠팔구])';
const digit = s => (s === undefined ? 0 : /\d/.test(s) ? Number(s) : KOR_DIGIT[s]);
const MONEY = [
  // 1만, 1.5만원, 1만5천원, 이만원 (숫자 앞에 한글이 붙어 있으면 다른 낱말로 봅니다)
  [new RegExp(`(?<![가-힣\\d.])${D}\\s*만\\s*(?:${D}\\s*천)?`), m => digit(m[1]) * 10000 + digit(m[2]) * 1000],
  // 만원, 만오천원, 만 오천 원 ('만두'·'만족'과 구분하려고 '원' 또는 '천'이 꼭 있어야 합니다)
  [new RegExp(`(?<![가-힣\\d])만\\s*(?:${D}\\s*천\\s*원?|원)`), m => 10000 + digit(m[1]) * 1000],
  [/(\d{4,5})\s*원/, m => Number(m[1])],
  // 8천, 8천원 / 팔천원 (한글 숫자는 '사천짜장'과 구분하려고 '원'이 꼭 있어야 합니다)
  [/(?<![가-힣\d.])(\d+)\s*천|(?<![가-힣])([일이삼사오육칠팔구])\s*천\s*원/, m => digit(m[1] ?? m[2]) * 1000]
];
export function parseMoney(text) {
  for (const [re, value] of MONEY) {
    const m = String(text || '').match(re);
    if (!m) continue;
    const v = Math.round(value(m) / 500) * 500;
    return v >= 3000 && v <= 30000 ? v : null;
  }
  return null;
}

export function parseText(text, {categories = [], tags = []} = {}) {
  const t = String(text || '').slice(0, 100);
  const o = {
    types: new Set(),
    tags: new Set(),
    categories: new Set(),
    spicy: null,
    portion: null,
    walk: null,
    budget: null
  };
  for (const [re, apply] of RULES) if (re.test(t)) apply(o);
  // 'OO 말고'는 그 음식 종류를 빼 달라는 뜻입니다. (예: '국물 말고 면' → 면만)
  for (const [key, re] of NOT_TYPES) if (re.test(t)) o.types.delete(key);
  if (!o.spicy && /얼큰|매운|맵게|매콤|칼칼|불닭|마라|화끈|스트레스/.test(t)) o.spicy = 'hot';
  for (const c of categories) {
    if (c.name.length < 2) continue; // '면'은 음식 종류(면)로 처리
    const key = c.name.replace(/&.*/, ''); // '샐러드&포케' → '샐러드'
    if (t.includes(c.name) || (key.length >= 2 && t.includes(key))) o.categories.add(c.id);
  }
  o.budget = parseMoney(t);
  const tagIds = [...o.tags].map(name => tags.find(x => x.name === name)?.id).filter(Boolean);
  const result = {types: [...o.types], tags: tagIds, categories: [...o.categories]};
  for (const k of ['spicy', 'portion', 'walk', 'budget']) if (o[k] !== null) result[k] = o[k];
  return result;
}

// ---------- 메뉴 특징 (개인 취향 계산용) ----------
function features(m) {
  const f = new Map();
  for (const id of m.categoryIds || []) f.set('cat:' + id, 1);
  for (const t of FOOD_TYPES) if (t.test(m)) f.set('type:' + t.key, 1);
  for (const id of m.tagIds || []) f.set('tag:' + id, 1);
  if (m.spicyLevel >= 2) f.set('spicy:hot', 1);
  else if (m.spicyLevel === 1) f.set('spicy:mild', 1);
  else f.set('spicy:none', 1);
  if (m.portionLevel === 1) f.set('portion:light', 1);
  if (m.portionLevel === 3) f.set('portion:heavy', 1);
  return f;
}
function addTo(target, f, w) {
  for (const [k, v] of f) target.set(k, (target.get(k) || 0) + v * w);
}
function share(map) {
  let total = 0;
  for (const v of map.values()) total += Math.abs(v);
  const out = new Map();
  if (!total) return out;
  for (const [k, v] of map) out.set(k, v / total);
  return out;
}

export function featureLabel(key, {categories = [], tags = []} = {}) {
  const [kind, id] = key.split(':');
  if (kind === 'cat') {
    const c = categories.find(x => x.id === Number(id));
    return c ? {emoji: emojiOf(c.name), text: c.name} : null;
  }
  if (kind === 'type') {
    const t = FOOD_TYPES.find(x => x.key === id);
    return t && {emoji: t.emoji, text: t.reason};
  }
  if (kind === 'tag') {
    const t = tags.find(x => x.id === Number(id));
    return t && {emoji: tagEmoji(t.name), text: '#' + t.name};
  }
  if (key === 'spicy:hot') return {emoji: '🌶️', text: '매운 음식'};
  if (key === 'spicy:mild') return {emoji: '🌶️', text: '살짝 매운 음식'};
  if (key === 'spicy:none') return {emoji: '🙂', text: '안 매운 음식'};
  if (key === 'portion:light') return {emoji: '🥗', text: '가벼운 식사'};
  if (key === 'portion:heavy') return {emoji: '💪', text: '든든한 식사'};
  return null;
}

// 사용자의 행동(조회·클릭·찜·후기)을 특징별 '선호도'로 바꿉니다.
// 선호도 = 내 기록에서 그 특징의 비율 - 전체 메뉴에서 그 특징의 비율  (많이 있는 특징이라서 높게 나오는 것을 보정)
export function buildProfile(rows, signals = {}, now = Date.now()) {
  const menus = new Map(),
    restaurantFeatures = new Map(),
    base = new Map();
  for (const r of rows) {
    const agg = new Map();
    let n = 0;
    for (const m of r.menus || []) {
      if (isSharedMenu(m.name)) continue;
      const f = features({...m, restaurantName: r.name});
      menus.set(m.id, f);
      addTo(agg, f, 1);
      addTo(base, f, 1);
      n++;
    }
    if (n) {
      for (const [k, v] of agg) agg.set(k, v / n);
      restaurantFeatures.set(r.id, agg);
    }
  }
  const S = DEEP_SETTINGS,
    raw = new Map();
  const decay = at => Math.pow(0.5, Math.max(0, (now - new Date(at).getTime()) / 86400000) / S.halfLifeDays);
  let count = 0;
  const add = (menuId, restaurantId, w, at) => {
    const f = (menuId && menus.get(menuId)) || restaurantFeatures.get(restaurantId);
    if (!f || !w) return;
    addTo(raw, f, w * decay(at));
    count++;
  };
  for (const x of signals.interactions || []) add(x.menuId, x.restaurantId, S.events[x.type] || 0, x.createdAt);
  for (const x of signals.favorites || []) add(null, x.restaurantId, S.events.favorite, x.createdAt);
  for (const x of signals.reviews || [])
    add(null, x.restaurantId, (x.rating - 3) * S.reviewWeight, x.updatedAt || x.createdAt);
  const mine = share(raw),
    all = share(base),
    lift = new Map();
  for (const k of new Set([...mine.keys()])) lift.set(k, (mine.get(k) || 0) - (all.get(k) || 0));
  return {lift, count, menus, cold: count < S.coldStartSignals};
}
export function profileSummary(profile, catalog, n = 4) {
  return [...profile.lift]
    .filter(([, v]) => v > 0.005)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({key: k, ...featureLabel(k, catalog), value: Math.round(v * 1000) / 10}))
    .filter(x => x.text);
}

// ---------- 지금 먹고 싶은 조건 일치도 ----------
function conditionOf(m, o, tagNames) {
  const parts = [];
  for (const key of o.types) {
    const t = FOOD_TYPES.find(x => x.key === key);
    parts.push({ok: t.test(m) ? 1 : 0, emoji: t.emoji, text: t.reason});
  }
  for (const id of o.tags)
    parts.push({
      ok: (m.tagIds || []).includes(id) ? 1 : 0,
      emoji: tagEmoji(tagNames.get(id)),
      text: '#' + tagNames.get(id)
    });
  if (o.spicy === 'hot')
    parts.push({
      ok: [0, 0.4, 1, 1][m.spicyLevel] ?? 0,
      emoji: '🌶️',
      text: m.spicyLevel >= 3 ? '아주 매워요' : '매콤해요'
    });
  if (o.spicy === 'mild') parts.push({ok: [0.4, 1, 0.5, 0][m.spicyLevel] ?? 0, emoji: '🌶️', text: '살짝 매콤'});
  if (o.spicy === 'none') parts.push({ok: 1, emoji: '🙂', text: '안 매워요'});
  if (o.portion === 'light') parts.push({ok: [0, 1, 0.4, 0][m.portionLevel], emoji: '🥗', text: '가볍게 먹기 좋아요'});
  if (o.portion === 'heavy') parts.push({ok: [0, 0, 0.5, 1][m.portionLevel], emoji: '💪', text: '든든해요'});
  return {
    score: parts.length ? parts.reduce((s, p) => s + p.ok, 0) / parts.length : 0.5,
    parts,
    active: parts.length > 0
  };
}

const bayes = (reviews = []) => {
  const n = reviews.length,
    sum = reviews.reduce((s, v) => s + v.rating, 0);
  return {avg: n ? Math.round((sum / n) * 10) / 10 : null, n, score: ((sum + 3.5 * 3) / (n + 3) - 1) / 4};
};

// ---------- 메인 ----------
// rows: Restaurant.all() 결과 · options: normalizeOptions 결과
// context: {school, categories, tags, signals (null = 비로그인), popularity: {menu: Map, restaurant: Map}, now}
export function deepRecommend(rows, options, context) {
  const {
    school,
    categories = [],
    tags = [],
    signals = null,
    popularity = {menu: new Map(), restaurant: new Map()},
    now = Date.now()
  } = context;
  const S = DEEP_SETTINGS,
    o = options;
  const tagNames = new Map(tags.map(t => [t.id, t.name])),
    catNames = new Map(categories.map(c => [c.id, c.name]));
  const profile = buildProfile(rows, signals || {}, now);
  const personal = !!signals && !profile.cold;
  // 비중 조정: 고른 조건이 없으면 조건 35%를 개인 취향 쪽으로, 기록이 없으면 취향 몫을 평점·인기로 넘깁니다.
  const w = {...S.weights};
  const wants = o.types.length || o.tags.length || o.spicy !== 'any' || o.portion !== 'any';
  if (!wants) {
    w.taste += 0.25;
    w.rating += 0.05;
    w.price += 0.05;
    w.condition = 0;
  }
  if (!personal) {
    w.rating += w.taste / 2;
    w.popularity += w.taste / 2;
    w.taste = 0;
  }
  const recent = new Set(
    (signals?.interactions || [])
      .filter(x => now - new Date(x.createdAt).getTime() < S.noveltyDays * 86400000)
      .map(x => x.restaurantId)
  );
  const maxPop = Math.max(1, ...[...popularity.menu.values()].map(Math.log1p));
  const counts = [...popularity.menu.values()].sort((a, b) => b - a),
    hot = counts[Math.floor(counts.length * 0.1)] ?? Infinity; // 상위 10% 메뉴

  // 1) 후보 + 하드 필터
  let candidates = [];
  for (const r of rows) {
    const distance = distanceMeters(school, r),
      walk = walkMinutes(distance);
    if (o.walk && walk > o.walk) continue;
    const rating = bayes(r.reviews);
    for (const m of r.menus || []) {
      if (m.price > o.budget || isSharedMenu(m.name)) continue;
      if (o.categories.length && !(m.categoryIds || []).some(id => o.categories.includes(id))) continue;
      if (o.spicy === 'none' && m.spicyLevel > 0) continue;
      candidates.push({r, m, distance, walk, rating, cond: conditionOf({...m, restaurantName: r.name}, o, tagNames)});
    }
  }
  const strict = candidates.filter(c => !c.cond.active || c.cond.score >= S.minCondition);
  const relaxed = strict.length < 3 && candidates.length > strict.length;
  if (!relaxed) candidates = strict;

  // 2) 개인 취향: 후보끼리 비교해 0~1로 맞춥니다.
  const dots = new Map();
  if (personal)
    for (const c of candidates) {
      let d = 0;
      for (const [k, v] of profile.menus.get(c.m.id) || []) d += v * (profile.lift.get(k) || 0);
      dots.set(c.m.id, d);
    }
  const maxDot = Math.max(1e-9, ...[...dots.values()].map(Math.abs));
  const topLiked = profileSummary(profile, {categories, tags}, 3);

  const scored = candidates.map(c => {
    const {r, m} = c;
    const pop =
      Math.log1p((popularity.menu.get(m.id) || 0) + 0.3 * (popularity.restaurant.get(r.id) || 0)) /
      Math.max(maxPop, Math.log1p(1));
    const parts = {
      condition: c.cond.score,
      taste: personal ? 0.5 + (0.5 * (dots.get(m.id) || 0)) / maxDot : 0.5,
      price: priceFit(m.price, o.budget),
      distance: distanceScore(c.distance),
      rating: c.rating.score,
      popularity: Math.min(1, pop),
      novelty: signals ? (recent.has(r.id) ? 0.2 : 1) : 0.5
    };
    const score = Object.entries(w).reduce((s, [k, v]) => s + v * parts[k], 0);
    // 추천 이유: 조건 일치 → 내 취향 → 거리·가격·평점·인기·새로움 순서로 최대 4개
    const reasons = c.cond.parts.filter(p => p.ok >= 0.99).map(({emoji, text}) => ({emoji, text}));
    if (personal && parts.taste >= 0.7) {
      const like = topLiked.find(x => profile.menus.get(m.id)?.has(x.key));
      if (like) reasons.push({emoji: '💛', text: `평소 좋아하는 ${like.text}`});
    }
    if (c.walk <= 5) reasons.push({emoji: '📍', text: `도보 ${c.walk}분`});
    if (parts.price >= 0.85) reasons.push({emoji: '💰', text: '예산에 알맞아요'});
    if (c.rating.avg >= 4.2 && c.rating.n >= 2) reasons.push({emoji: '⭐', text: `평점 ${c.rating.avg.toFixed(1)}`});
    if ((popularity.menu.get(m.id) || 0) >= Math.max(3, hot)) reasons.push({emoji: '🔥', text: '많이 찾는 메뉴'});
    if (signals && parts.novelty === 1 && personal) reasons.push({emoji: '✨', text: '요즘 안 가 본 곳'});
    const catName = catNames.get((m.categoryIds || [])[0]) || '';
    return {
      restaurantId: r.id,
      menuId: m.id,
      name: r.name,
      menuName: m.name,
      price: m.price,
      lat: r.lat,
      lng: r.lng,
      address: r.address,
      distance: c.distance,
      walkMinutes: c.walk,
      categoryName: catName,
      emoji: emojiOf(catName),
      rating: c.rating.avg,
      reviewCount: c.rating.n,
      spicyLevel: m.spicyLevel,
      portionLevel: m.portionLevel,
      tags: (m.tagIds || []).map(id => tagNames.get(id)).filter(Boolean),
      score: Math.round(score * 100),
      match: Math.round(c.cond.score * 100),
      breakdown: Object.fromEntries(
        Object.entries(parts).map(([k, v]) => [
          k,
          {value: Math.round(v * 100), weight: Math.round(w[k] * 100), points: Math.round(v * w[k] * 1000) / 10}
        ])
      ),
      reasons: reasons.slice(0, 4)
    };
  });

  // 3) 식당마다 1개 → 점수순 → 상위 3개 다양성 보정
  const best = new Map();
  for (const x of scored) {
    const b = best.get(x.restaurantId);
    if (!b || x.score > b.score || (x.score === b.score && x.price < b.price)) best.set(x.restaurantId, x);
  }
  const sorted = [...best.values()].sort((a, b) => b.score - a.score || a.distance - b.distance);
  const picked = [],
    used = new Set();
  while (picked.length < 3 && sorted.length) {
    const top = sorted[0].score;
    const i = Math.max(
      0,
      sorted.findIndex(x => !used.has(x.categoryName) && x.score >= top - S.diversityGap)
    );
    const [x] = sorted.splice(i, 1);
    picked.push(x);
    used.add(x.categoryName);
  }
  const items = [...picked, ...sorted].slice(0, S.limit);
  return {
    items,
    total: best.size,
    personalized: personal,
    relaxed,
    weights: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round(v * 100)])),
    profile: {signals: profile.count, liked: profileSummary(profile, {categories, tags})}
  };
}
