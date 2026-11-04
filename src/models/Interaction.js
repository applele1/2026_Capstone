import {config} from '../config.js';
import {db, readStore, mutateStore, nextId} from './store.js';
const pg = () => config.storage === 'postgres';
export const INTERACTION_TYPES = ['view', 'click', 'recommend_click'];
// 행동 기록 (심층 추천의 개인 취향 계산에 사용)
export const Interaction = {
  log: async (userId, {restaurantId, menuId = null, type}) => {
    if (pg()) return db.userMenuInteraction.create({data: {userId, restaurantId, menuId, type}});
    return mutateStore(d => {
      const row = {id: nextId(d.interactions), userId, restaurantId, menuId, type, createdAt: new Date().toISOString()};
      d.interactions.push(row);
      // 데모 파일이 끝없이 커지지 않도록 사용자당 최근 300개만 보관합니다.
      const mine = d.interactions.filter(x => x.userId === userId);
      if (mine.length > 300) {
        const drop = new Set(mine.slice(0, mine.length - 300).map(x => x.id));
        d.interactions = d.interactions.filter(x => !drop.has(x.id));
      }
      return row;
    });
  },
  // 한 사용자의 취향 신호: 행동 기록(최근 180일) · 찜 · 후기
  signals: async userId => {
    const since = new Date(Date.now() - 180 * 86400000);
    if (pg()) {
      const [interactions, favorites, reviews] = await Promise.all([
        db.userMenuInteraction.findMany({
          where: {userId, createdAt: {gte: since}},
          select: {restaurantId: true, menuId: true, type: true, createdAt: true}
        }),
        db.favorite.findMany({where: {userId}, select: {restaurantId: true, createdAt: true}}),
        db.review.findMany({
          where: {userId},
          select: {restaurantId: true, rating: true, createdAt: true, updatedAt: true}
        })
      ]);
      return {interactions, favorites, reviews};
    }
    return readStore(d => ({
      interactions: d.interactions.filter(x => x.userId === userId && new Date(x.createdAt) >= since),
      favorites: d.favorites.filter(x => x.userId === userId),
      reviews: d.reviews.filter(x => x.userId === userId)
    }));
  },
  // 인기도: 최근 30일 메뉴별 · 식당별 행동 수 (+ 찜 수)
  popularity: async () => {
    const since = new Date(Date.now() - 30 * 86400000),
      menu = new Map(),
      restaurant = new Map();
    const add = (map, key, n) => {
      if (key != null) map.set(key, (map.get(key) || 0) + n);
    };
    if (pg()) {
      const [byMenu, byRestaurant, favs] = await Promise.all([
        db.userMenuInteraction.groupBy({
          by: ['menuId'],
          where: {createdAt: {gte: since}, menuId: {not: null}},
          _count: {_all: true}
        }),
        db.userMenuInteraction.groupBy({by: ['restaurantId'], where: {createdAt: {gte: since}}, _count: {_all: true}}),
        db.favorite.groupBy({by: ['restaurantId'], _count: {_all: true}})
      ]);
      for (const x of byMenu) add(menu, x.menuId, x._count._all);
      for (const x of byRestaurant) add(restaurant, x.restaurantId, x._count._all);
      for (const x of favs) add(restaurant, x.restaurantId, x._count._all);
    } else
      readStore(d => {
        for (const x of d.interactions) {
          if (new Date(x.createdAt) < since) continue;
          add(menu, x.menuId, 1);
          add(restaurant, x.restaurantId, 1);
        }
        for (const x of d.favorites) add(restaurant, x.restaurantId, 1);
      });
    return {menu, restaurant};
  },
  // 관리자 통계
  stats: async () => {
    if (pg()) {
      const [users, admins, reviews, favorites, byType] = await Promise.all([
        db.user.count(),
        db.user.count({where: {role: 'admin'}}),
        db.review.count(),
        db.favorite.count(),
        db.userMenuInteraction.groupBy({by: ['type'], _count: {_all: true}})
      ]);
      return {
        users,
        admins,
        reviews,
        favorites,
        interactions: Object.fromEntries(byType.map(x => [x.type, x._count._all]))
      };
    }
    return readStore(d => {
      const interactions = {};
      for (const x of d.interactions) interactions[x.type] = (interactions[x.type] || 0) + 1;
      return {
        users: d.users.length,
        admins: d.users.filter(u => u.role === 'admin').length,
        reviews: d.reviews.length,
        favorites: d.favorites.length,
        interactions
      };
    });
  }
};
