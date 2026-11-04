import {config} from '../config.js';
import {Restaurant} from '../models/Restaurant.js';
import {User} from '../models/User.js';
import {Interaction, INTERACTION_TYPES} from '../models/Interaction.js';
import {emojiOf} from '../services/recommendation.js';
import {
  deepRecommend,
  normalizeOptions,
  parseText,
  buildProfile,
  profileSummary,
  FOOD_TYPES,
  SPICY,
  PORTION,
  WALK,
  DEEP_SETTINGS,
  tagEmoji
} from '../services/deepRecommendation.js';
const fail = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
const catalog = async () => {
  const [categories, tags] = await Promise.all([Restaurant.categories(), Restaurant.tags()]);
  return {categories, tags};
};

// 화면에 그릴 선택지 (카테고리·태그는 DB에서)
export async function options(req, res) {
  const {categories, tags} = await catalog();
  res.json({
    types: FOOD_TYPES.map(({key, label, emoji}) => ({key, label, emoji})),
    spicy: SPICY,
    portion: PORTION,
    walk: WALK,
    tags: tags.map(t => ({id: t.id, name: t.name, emoji: tagEmoji(t.name)})),
    categories: categories.map(c => ({id: c.id, name: c.name, emoji: emojiOf(c.name)})),
    weights: DEEP_SETTINGS.weights
  });
}

// "비 오는데 뜨끈하고 얼큰한 거 만원 안쪽" → 조건
export async function parse(req, res) {
  const text = String(req.query.text || '').trim();
  if (!text || text.length > 100) fail('문장은 1~100자로 입력해 주세요.');
  res.json({options: parseText(text, await catalog())});
}

// 심층 추천. 관리자는 asUser로 다른 회원 입장에서 결과를 확인할 수 있습니다.
export async function recommend(req, res) {
  const cat = await catalog();
  const opts = normalizeOptions(req.query, cat);
  let target = req.user;
  if (req.query.asUser) {
    if (req.user?.role !== 'admin') fail('관리자만 사용할 수 있습니다.', 403);
    target = await User.findById(Number(req.query.asUser));
    if (!target) fail('회원을 찾을 수 없습니다.', 404);
  }
  const [rows, signals, popularity, saved] = await Promise.all([
    Restaurant.all(),
    target ? Interaction.signals(target.id) : null,
    Interaction.popularity(),
    req.user ? Restaurant.favoriteIds(req.user.id) : []
  ]);
  const result = deepRecommend(rows, opts, {school: config.school, ...cat, signals, popularity});
  const admin = req.user?.role === 'admin';
  res.json({
    ...result,
    items: result.items.map(({breakdown, ...x}) => ({
      ...x,
      saved: saved.includes(x.restaurantId),
      ...(admin ? {breakdown} : {})
    })),
    options: opts,
    asUser: target && target.id !== req.user?.id ? {id: target.id, name: target.name} : null
  });
}

// 행동 기록: 추천 목록에서 메뉴 선택(click) · 심층 추천 결과 선택(recommend_click). 상세 열기(view)는 서버가 자동 기록
export async function track(req, res) {
  const {restaurantId, menuId = null, type} = req.body;
  if (!['click', 'recommend_click'].includes(type) || !INTERACTION_TYPES.includes(type))
    fail('기록 종류를 확인해 주세요.');
  const r = (await Restaurant.all()).find(x => x.id === Number(restaurantId));
  if (!r) fail('식당을 찾을 수 없습니다.', 404);
  if (menuId !== null && !r.menus.some(m => m.id === Number(menuId))) fail('메뉴를 찾을 수 없습니다.', 404);
  await Interaction.log(req.user.id, {restaurantId: r.id, menuId: menuId === null ? null : Number(menuId), type});
  res.status(201).json({ok: true});
}

// ===== 관리자 =====
export async function adminUsers(req, res) {
  const [users, rows, cat] = await Promise.all([User.list(), Restaurant.all(), catalog()]);
  const items = await Promise.all(
    users.map(async u => {
      const p = buildProfile(rows, await Interaction.signals(u.id));
      return {...u, signals: p.count, liked: profileSummary(p, cat, 3).map(x => x.text)};
    })
  );
  res.json({items});
}
export async function adminStats(req, res) {
  res.json(await Interaction.stats());
}
