const { store } = require('../models/store');
const { recommend, SORTS } = require('../services/recommend');
const { TRAITS, SPICE_OPTIONS, WALK_OPTIONS } = require('../models/menuTaste');
const { SCHOOL, CATEGORIES } = require('../config');
const { HttpError } = require('../utils/httpError');
const { optionalUser } = require('../middleware/auth');
const { parseId, readReview } = require('../utils/validators');
const { asyncRoute } = require('../middleware/asyncRoute');

const listRestaurants = asyncRoute(async (req, res) => {
  const rawBudget = String(req.query.budget ?? '10000');
  if (!/^\d+$/.test(rawBudget)) throw new HttpError(400, '예산은 숫자만 입력해 주세요.');
  const budget = Number(rawBudget);
  const categories = String(req.query.category ?? 'all')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => CATEGORIES.includes(item) && item !== 'all');
  const category = categories.length ? categories : 'all';
  const sort = SORTS.includes(req.query.sort) ? req.query.sort : 'recommend';
  const spice = SPICE_OPTIONS.includes(req.query.spice) ? req.query.spice : 'any';
  const walk = WALK_OPTIONS.includes(req.query.walk) ? req.query.walk : 'any';
  const traits = String(req.query.traits || '')
    .split(',')
    .map((trait) => trait.trim())
    .filter((trait) => TRAITS.includes(trait));
  if (budget < 1000 || budget > 100000) throw new HttpError(400, '예산은 1,000원 ~ 100,000원 사이로 입력해 주세요.');

  const focusId = req.query.id ? parseId(req.query.id) : null;
  const restaurants = await store.listRestaurants();
  const taste = { spice, traits, walk };
  let results = recommend(restaurants, { budget, category, sort, school: SCHOOL, ...taste });
  // 현재 조건에 없어도, 찜 목록에서 고른 식당은 추천 화면에 함께 보여 줍니다.
  if (focusId && !results.some((r) => r.id === focusId)) {
    const relaxed = recommend(restaurants, {
      budget: 100000,
      category: 'all',
      sort: 'distance',
      school: SCHOOL,
      spice: 'any',
      traits: [],
      walk: 'any'
    });
    const focused = relaxed.find((r) => r.id === focusId);
    if (focused) results = [focused, ...results];
  }
  res.json({ results });
});

const listReviews = asyncRoute(async (req, res) => {
  const user = await optionalUser(req);
  res.json({ reviews: await store.listReviews(parseId(req.params.id), user?.id) });
});

const addReview = asyncRoute(async (req, res) => {
  const restaurantId = parseId(req.params.id);
  const review = await store.addReview(restaurantId, {
    ...readReview(req.body),
    nickname: req.user.nickname,
    user_id: req.user.id
  });
  res.status(201).json({ review });
});

module.exports = { listRestaurants, listReviews, addReview };
