const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const seed = require('../../data/seed');
const { attachTaste, tasteFromRow } = require('./menuTaste');
const { HttpError } = require('../utils/httpError');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

// 식당 카테고리 = 메뉴 카테고리를 많은 순으로 모은 목록 (첫 번째가 대표 카테고리)
function withCategories(restaurant) {
  const counts = new Map();
  restaurant.menus.forEach((m) => m.categories.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1)));
  const categories = [...counts].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return { ...restaurant, categories };
}

const defaultNickname = (email) => email.split('@')[0].slice(0, 20);

function signupErrorMessage(error) {
  const text = `${error.message || ''} ${error.code || ''}`.toLowerCase();
  if (
    text.includes('already been registered') ||
    text.includes('already registered') ||
    text.includes('email_exists') ||
    text.includes('user_already_exists')
  ) {
    return '이미 존재하는 이메일입니다';
  }
  return error.message;
}

const REVIEW_COLUMNS = 'id, nickname, rating, content, created_at';
const MY_REVIEW_COLUMNS = `${REVIEW_COLUMNS}, restaurant_id`;

function supabaseStore() {
  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, clientOptions);

  const check = ({ data, error }) => {
    if (error) throw new HttpError(500, error.message);
    return data;
  };

  // 닉네임은 Supabase Auth 회원 정보(user_metadata)에 저장합니다.
  const toUser = (user) => ({
    id: user.id,
    email: user.email,
    nickname: user.user_metadata?.nickname || defaultNickname(user.email),
    created_at: user.created_at
  });

  // menus.맵기 열이 있으면 표에 저장된 맵기·특징·거리를 읽습니다.
  let tasteSchema;
  const loadTasteSchema = async () => {
    if (tasteSchema?.columns) return tasteSchema;
    const spice = await admin.from('menus').select('맵기').limit(1);
    tasteSchema = { columns: !spice.error };
    return tasteSchema;
  };

  return {
    mode: 'supabase',

    async listRestaurants() {
      const schema = await loadTasteSchema();
      const menuColumns = schema.columns
        ? 'id, name, price, 맵기, 시원함, 따뜻한, 바삭한, 건강한, 간편한, 거리m, 도보분, menu_categories(category)'
        : 'id, name, price, menu_categories(category)';
      const rows = check(
        await admin
          .from('restaurants')
          .select(`id, name, address, lat, lng, menus(${menuColumns}), reviews(rating)`)
      );
      return rows.map(({ menus, reviews, ...r }) => {
        const restaurant = withCategories({
          ...r,
          menus: menus.map(({ menu_categories, ...m }) => {
            const base = { ...m, categories: menu_categories.map((c) => c.category) };
            return schema.columns ? tasteFromRow(base) : attachTaste(base);
          }),
          ratings: reviews.map((v) => v.rating)
        });
        const sample = restaurant.menus.find((m) => Number.isInteger(Number(m.walkMinutes)) && m.walkMinutes != null);
        if (!sample) return restaurant;
        return { ...restaurant, walkMinutes: Number(sample.walkMinutes), distanceMeters: Number(sample.distanceMeters) };
      });
    },

    async listReviews(restaurantId, userId) {
      const rows = check(
        await admin
          .from('reviews')
          .select(`${REVIEW_COLUMNS}, user_id`)
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false })
      );
      return rows.map(({ user_id, ...review }) => ({ ...review, mine: Boolean(userId && user_id === userId) }));
    },

    async addReview(restaurantId, review) {
      const existing = check(
        await admin
          .from('reviews')
          .select('id')
          .eq('restaurant_id', restaurantId)
          .eq('user_id', review.user_id)
          .maybeSingle()
      );
      if (existing) throw new HttpError(409, '이 식당에는 후기를 한 번만 남길 수 있어요.');
      return check(
        await admin
          .from('reviews')
          .insert({ restaurant_id: restaurantId, ...review })
          .select(REVIEW_COLUMNS)
          .single()
      );
    },

    async listUserReviews(userId) {
      const rows = check(
        await admin
          .from('reviews')
          .select(`${MY_REVIEW_COLUMNS}, restaurants(name)`)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );
      return rows.map(({ restaurants, ...r }) => ({ ...r, restaurant_name: restaurants?.name ?? '' }));
    },

    // 모든 수정·삭제는 user_id 조건을 함께 걸어 본인 후기만 바뀌게 합니다.
    async updateReview(userId, reviewId, { rating, content }) {
      const row = check(
        await admin
          .from('reviews')
          .update({ rating, content })
          .eq('id', reviewId)
          .eq('user_id', userId)
          .select(MY_REVIEW_COLUMNS)
          .maybeSingle()
      );
      if (!row) throw new HttpError(404, '후기를 찾을 수 없어요.');
      return row;
    },

    async deleteReview(userId, reviewId) {
      const rows = check(await admin.from('reviews').delete().eq('id', reviewId).eq('user_id', userId).select('id'));
      if (rows.length === 0) throw new HttpError(404, '후기를 찾을 수 없어요.');
    },

    async signUp(email, password, nickname) {
      const { error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nickname }
      });
      if (error) throw new HttpError(400, signupErrorMessage(error));
      return this.signIn(email, password);
    },

    async signIn(email, password) {
      // 요청마다 새 클라이언트를 만들어 사용자 세션이 admin 클라이언트에 섞이지 않게 합니다.
      const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, clientOptions);
      const { data, error } = await authClient.auth.signInWithPassword({ email, password });
      if (error) throw new HttpError(401, '이메일 또는 비밀번호가 올바르지 않아요.');
      return { token: data.session.access_token, user: toUser(data.user) };
    },

    async getUser(token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return null;
      return toUser(data.user);
    },

    async updateNickname(userId, nickname) {
      const { data, error } = await admin.auth.admin.updateUserById(userId, { user_metadata: { nickname } });
      if (error) throw new HttpError(500, error.message);
      check(await admin.from('reviews').update({ nickname }).eq('user_id', userId));
      return toUser(data.user);
    },

    async updatePassword(userId, password) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw new HttpError(400, error.message);
    },

    // reviews, favorites 표는 auth.users 를 on delete cascade 로 참조하므로 함께 지워집니다.
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new HttpError(500, error.message);
    },

    async listFavoriteIds(userId) {
      const rows = check(await admin.from('favorites').select('restaurant_id').eq('user_id', userId));
      return rows.map((r) => r.restaurant_id);
    },

    async addFavorite(userId, restaurantId) {
      check(
        await admin
          .from('favorites')
          .upsert({ user_id: userId, restaurant_id: restaurantId }, { onConflict: 'user_id,restaurant_id' })
      );
    },

    async removeFavorite(userId, restaurantId) {
      check(await admin.from('favorites').delete().eq('user_id', userId).eq('restaurant_id', restaurantId));
    }
  };
}

// Supabase 설정 없이도 화면을 확인할 수 있는 메모리 저장소 (서버 재시작 시 초기화)
function memoryStore() {
  let nextReviewId = 1;
  const restaurants = [];
  const reviews = [];
  seed.forEach(({ category, menus, reviews: seedReviews = [], name, address, lat, lng }, i) => {
    const id = i + 1;
    restaurants.push({
      id, name, address, lat, lng,
      menus: menus.map((m, j) => attachTaste({ id: id * 100 + j, ...m, categories: [category] }))
    });
    seedReviews.forEach((v) =>
      reviews.push({ id: nextReviewId++, restaurant_id: id, ...v, created_at: new Date().toISOString() })
    );
  });

  const users = new Map(); // email -> { id, email, nickname, created_at, passwordHash }
  const sessions = new Map(); // token -> userId
  const favorites = new Map(); // userId -> Set<restaurantId>
  const hash = (pw) => crypto.createHash('sha256').update(pw).digest('hex');
  const findUser = (userId) => [...users.values()].find((u) => u.id === userId);
  const toUser = ({ id, email, nickname, created_at }) => ({ id, email, nickname, created_at });
  const toMyReview = ({ user_id, ...v }) => ({
    ...v,
    restaurant_name: restaurants.find((r) => r.id === v.restaurant_id)?.name ?? ''
  });
  const findMyReview = (userId, reviewId) => {
    const review = reviews.find((v) => v.id === reviewId && v.user_id === userId);
    if (!review) throw new HttpError(404, '후기를 찾을 수 없어요.');
    return review;
  };

  return {
    mode: 'memory',

    async listRestaurants() {
      return restaurants.map((r) =>
        withCategories({ ...r, ratings: reviews.filter((v) => v.restaurant_id === r.id).map((v) => v.rating) })
      );
    },

    async listReviews(restaurantId, userId) {
      return reviews
        .filter((v) => v.restaurant_id === restaurantId)
        .sort((a, b) => b.id - a.id)
        .map(({ restaurant_id, user_id, ...v }) => ({ ...v, mine: Boolean(userId && user_id === userId) }));
    },

    async addReview(restaurantId, review) {
      if (!restaurants.some((r) => r.id === restaurantId)) throw new HttpError(404, '식당을 찾을 수 없어요.');
      if (review.user_id && reviews.some((v) => v.restaurant_id === restaurantId && v.user_id === review.user_id)) {
        throw new HttpError(409, '이 식당에는 후기를 한 번만 남길 수 있어요.');
      }
      const row = { id: nextReviewId++, restaurant_id: restaurantId, ...review, created_at: new Date().toISOString() };
      reviews.push(row);
      const { restaurant_id, user_id, ...out } = row;
      return out;
    },

    async listUserReviews(userId) {
      return reviews
        .filter((v) => v.user_id === userId)
        .sort((a, b) => b.id - a.id)
        .map(toMyReview);
    },

    async updateReview(userId, reviewId, { rating, content }) {
      const review = findMyReview(userId, reviewId);
      Object.assign(review, { rating, content });
      const { restaurant_name, ...out } = toMyReview(review);
      return out;
    },

    async deleteReview(userId, reviewId) {
      reviews.splice(reviews.indexOf(findMyReview(userId, reviewId)), 1);
    },

    async signUp(email, password, nickname) {
      if (users.has(email)) throw new HttpError(400, '이미 존재하는 이메일입니다');
      users.set(email, {
        id: crypto.randomUUID(),
        email,
        nickname,
        created_at: new Date().toISOString(),
        passwordHash: hash(password)
      });
      return this.signIn(email, password);
    },

    async signIn(email, password) {
      const user = users.get(email);
      if (!user || user.passwordHash !== hash(password)) {
        throw new HttpError(401, '이메일 또는 비밀번호가 올바르지 않아요.');
      }
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, user.id);
      return { token, user: toUser(user) };
    },

    async getUser(token) {
      const user = findUser(sessions.get(token));
      return user ? toUser(user) : null;
    },

    async updateNickname(userId, nickname) {
      const user = findUser(userId);
      user.nickname = nickname;
      reviews.filter((v) => v.user_id === userId).forEach((v) => (v.nickname = nickname));
      return toUser(user);
    },

    async updatePassword(userId, password) {
      const user = findUser(userId);
      if (!user) throw new HttpError(404, '회원을 찾을 수 없어요.');
      user.passwordHash = hash(password);
    },

    async deleteUser(userId) {
      const user = findUser(userId);
      if (!user) return;
      users.delete(user.email);
      sessions.forEach((id, token) => id === userId && sessions.delete(token));
      favorites.delete(userId);
      for (let i = reviews.length - 1; i >= 0; i--) if (reviews[i].user_id === userId) reviews.splice(i, 1);
    },

    async listFavoriteIds(userId) {
      return [...(favorites.get(userId) || [])];
    },

    async addFavorite(userId, restaurantId) {
      if (!favorites.has(userId)) favorites.set(userId, new Set());
      favorites.get(userId).add(restaurantId);
    },

    async removeFavorite(userId, restaurantId) {
      favorites.get(userId)?.delete(restaurantId);
    }
  };
}

const store = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? supabaseStore() : memoryStore();

module.exports = { store };
