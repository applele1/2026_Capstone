const WALK_METERS_PER_MIN = 67; // 약 4km/h
const WALK_LIMITS = { 10: 10, 15: 15 };

// 1등 가격, 2등 카테고리·맵기·특징, 3등 거리, 4등 평점
const WEIGHTS = { price: 4, preference: 3, distance: 2, rating: 1 };

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const SORTERS = {
  recommend: (a, b) => b.score - a.score || a.minPrice - b.minPrice || a.distance - b.distance,
  distance: (a, b) => a.distance - b.distance || a.minPrice - b.minPrice,
  rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviewCount - a.reviewCount || a.distance - b.distance,
  price: (a, b) => a.minPrice - b.minPrice || a.distance - b.distance,
  random: () => 0
};

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 후보들 안에서 가장 작은 값은 1, 가장 큰 값은 0이 되도록 바꿉니다.
function lowerIsBetter(value, min, max) {
  return max === min ? 1 : (max - value) / (max - min);
}

// 후보들 안에서 가장 큰 값은 1, 가장 작은 값은 0이 되도록 바꿉니다.
function higherIsBetter(value, min, max) {
  return max === min ? 1 : (value - min) / (max - min);
}

// 'all'이거나 비어 있으면 카테고리 제한이 없습니다. 여러 개면 하나라도 맞는 메뉴를 고릅니다.
function selectedCategories(category) {
  const list = (Array.isArray(category) ? category : String(category || 'all').split(','))
    .map((item) => String(item).trim())
    .filter((item) => item && item !== 'all');
  return list.length ? list : null;
}

function matchesCategory(menu, categories) {
  if (!categories) return true;
  return categories.some((category) => (menu.categories || []).includes(category));
}

// 고른 카테고리, 맵기, 특징이 얼마나 맞는지 0~1. 고르지 않은 항목은 빼서 점수를 깎지 않습니다.
function preferenceScore(menu, categories, spice, traits) {
  const parts = [];
  if (categories) parts.push(matchesCategory(menu, categories) ? 1 : 0);
  if (spice !== 'any') parts.push(Number(menu.spice) === Number(spice) ? 1 : 0);
  if (traits.length > 0) {
    const hits = traits.filter((trait) => (menu.traits || []).includes(trait)).length;
    parts.push(hits / traits.length);
  }
  if (parts.length === 0) return 1;
  return parts.reduce((sum, value) => sum + value, 0) / parts.length;
}

/**
 * 예산, 카테고리, 맵기, 음식 특징, 도보 시간에 맞는 메뉴가 있는 식당을 모두 고르고
 * 정렬 기준에 따라 순위를 매겨 돌려줍니다.
 * 화면에서는 1~3위 카드를 그대로 두고, 나머지 식당은 한 페이지에 3곳씩 넘겨 봅니다.
 * 랜덤 추천은 이 조건을 보지 않고 전체 식당에서 고릅니다.
 * 추천순 점수는 가격 4, 카테고리·맵기·특징 3, 거리 2, 평점 1의 비율입니다.
 */
function recommend(restaurants, {
  budget,
  category = 'all',
  sort = 'recommend',
  school,
  spice = 'any',
  traits = [],
  walk = 'any'
}) {
  const unrestricted = sort === 'random';
  const categories = unrestricted ? null : selectedCategories(category);
  const wantedSpice = unrestricted || spice === 'any' ? null : Number(spice);
  const wantedTraits = unrestricted ? [] : traits;
  const maxWalk = unrestricted ? null : (WALK_LIMITS[walk] ?? null);
  const candidates = [];

  for (const r of restaurants) {
    if (r.lat == null || r.lng == null) continue;

    const distance = Number.isInteger(r.distanceMeters)
      ? r.distanceMeters
      : Math.round(haversineMeters(school.lat, school.lng, r.lat, r.lng));
    const walkMinutes = Number.isInteger(r.walkMinutes)
      ? r.walkMinutes
      : Math.max(1, Math.round(distance / WALK_METERS_PER_MIN));
    if (maxWalk != null && walkMinutes > maxWalk) continue;

    const menus = r.menus.filter((m) => {
      if (!unrestricted && m.price > budget) return false;
      if (!matchesCategory(m, categories)) return false;
      if (wantedSpice != null && Number(m.spice) !== wantedSpice) return false;
      if (wantedTraits.length > 0 && !wantedTraits.some((trait) => (m.traits || []).includes(trait))) return false;
      return true;
    });
    if (menus.length === 0) continue;

    const reviewCount = r.ratings.length;
    const rating = reviewCount
      ? Math.round((r.ratings.reduce((sum, n) => sum + n, 0) / reviewCount) * 10) / 10
      : null;

    candidates.push({
      id: r.id,
      name: r.name,
      category: categories
        ? r.categories.find((item) => categories.includes(item)) || categories[0]
        : r.categories[0],
      categories: r.categories,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      menus,
      minPrice: Math.min(...menus.map((m) => m.price)),
      distance,
      walkMinutes,
      rating,
      reviewCount
    });
  }

  if (candidates.length === 0) return [];

  const prices = candidates.flatMap((c) => c.menus.map((m) => m.price));
  const distances = candidates.map((c) => c.distance);
  const ratings = candidates.map((c) => c.rating ?? 0);
  const [minPrice, maxPrice] = [Math.min(...prices), Math.max(...prices)];
  const [minDistance, maxDistance] = [Math.min(...distances), Math.max(...distances)];
  const [minRating, maxRating] = [Math.min(...ratings), Math.max(...ratings)];
  const weightTotal = WEIGHTS.price + WEIGHTS.preference + WEIGHTS.distance + WEIGHTS.rating;

  for (const c of candidates) {
    const distanceScore = lowerIsBetter(c.distance, minDistance, maxDistance);
    const ratingScore = higherIsBetter(c.rating ?? 0, minRating, maxRating);
    let best = null;
    for (const menu of c.menus) {
      const priceScore = lowerIsBetter(menu.price, minPrice, maxPrice);
      const match = preferenceScore(menu, categories, spice, wantedTraits);
      const score = Math.round(
        ((WEIGHTS.price * priceScore +
          WEIGHTS.preference * match +
          WEIGHTS.distance * distanceScore +
          WEIGHTS.rating * ratingScore) /
          weightTotal) *
          100
      );
      if (!best || score > best.score || (score === best.score && menu.price < best.menu.price)) {
        best = { menu, score };
      }
    }
    const others = c.menus
      .filter((menu) => menu.id !== best.menu.id)
      .sort((a, b) => a.price - b.price);
    c.recommendedMenu = best.menu;
    c.menus = [best.menu, ...others];
    c.score = best.score;
  }

  if (sort === 'random') {
    for (const c of candidates) {
      const pick = c.menus[Math.floor(Math.random() * c.menus.length)];
      c.recommendedMenu = pick;
      c.menus = [pick, ...c.menus.filter((menu) => menu.id !== pick.id)];
    }
  }

  return sort === 'random' ? shuffle(candidates) : candidates.sort(SORTERS[sort] || SORTERS.recommend);
}

module.exports = { recommend, haversineMeters, SORTS: Object.keys(SORTERS) };
