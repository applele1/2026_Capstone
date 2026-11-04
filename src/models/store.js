import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {config} from '../config.js';
// demo 모드: 식당·메뉴·카테고리는 엑셀에서 옮긴 data/seed/bapit-data.json을 읽기 전용으로 사용하고,
// 회원·세션·후기·찜·최근 기록만 data/demo.json에 저장합니다.
const SEED_PATH = new URL('../../data/seed/bapit-data.json', import.meta.url);
const TEST_USERS_PATH = new URL('../../data/seed/bapit-test-users.json', import.meta.url);
const emptyUserData = () => ({users: [], sessions: [], reviews: [], favorites: [], recentViews: [], interactions: []});
let data,
  catalog,
  queue = Promise.resolve();
export let db;
export async function initializeStore() {
  if (config.storage === 'postgres') {
    const {PrismaClient} = await import('@prisma/client');
    db = new PrismaClient();
    await db.$connect();
    return;
  }
  catalog = buildCatalog(JSON.parse(await readFile(SEED_PATH, 'utf8')));
  await mkdir(path.dirname(config.dataPath), {recursive: true});
  try {
    data = JSON.parse(await readFile(config.dataPath, 'utf8'));
    // 예전 버전(예시 식당 포함) demo.json이면 예시 식당과 그 식당에 남긴 기록을 정리합니다.
    if (data.restaurants) {
      const {users = [], sessions = []} = data;
      data = {...emptyUserData(), users, sessions};
      await persist(data);
    }
    data = {...emptyUserData(), ...data};
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    data = config.demoTestUsers ? await testUserData() : emptyUserData();
    await persist(data);
  }
}
function buildCatalog(seed) {
  const group = pairs => {
    const map = new Map();
    for (const [menuId, id] of pairs || []) {
      if (!map.has(menuId)) map.set(menuId, []);
      map.get(menuId).push(id);
    }
    return map;
  };
  const cats = group(seed.menuCategories),
    tags = group(seed.menuTags);
  // 심층 추천용 속성(맵기·양·밥/면/국물/고기)과 태그도 함께 읽습니다.
  const menus = seed.menus.map(m => ({
    id: m.id,
    restaurantId: m.restaurantId,
    name: m.name,
    price: m.price,
    spicyLevel: m.spicyLevel ?? 0,
    portionLevel: m.portionLevel ?? 2,
    isRice: !!m.isRice,
    isNoodle: !!m.isNoodle,
    isSoup: !!m.isSoup,
    isMeat: !!m.isMeat,
    categoryIds: cats.get(m.id) || [],
    tagIds: tags.get(m.id) || []
  }));
  return {
    categories: [...seed.categories].sort((a, b) => a.id - b.id),
    tags: [...(seed.tags || [])].sort((a, b) => a.id - b.id),
    restaurants: seed.restaurants.map(r => ({...r, menus: menus.filter(m => m.restaurantId === r.id)}))
  };
}
// 처음 실행할 때 관리자 1명 + 테스트 회원 50명과 그 기록을 넣습니다. (ago = 몇 분 전 → 실제 시각으로 변환)
async function testUserData() {
  let seed;
  try {
    seed = JSON.parse(await readFile(TEST_USERS_PATH, 'utf8'));
  } catch {
    return emptyUserData();
  }
  const at = ago => new Date(Date.now() - ago * 60000).toISOString();
  return {
    ...emptyUserData(),
    users: seed.users.map(({ago, persona, ...u}) => ({...u, createdAt: at(ago)})),
    reviews: seed.reviews.map(({ago, edited, ...r}) => ({
      ...r,
      createdAt: at(ago),
      updatedAt: edited ? at(ago - 2880) : null
    })),
    favorites: seed.favorites.map(({ago, ...r}) => ({...r, createdAt: at(ago)})),
    recentViews: seed.recentViews.map(({ago, ...r}) => ({...r, viewedAt: at(ago)})),
    interactions: seed.interactions.map(({ago, ...r}) => ({...r, createdAt: at(ago)}))
  };
}
export const readCatalog = fn => fn(catalog);
async function persist(value) {
  const tmp = config.dataPath + '.tmp';
  await writeFile(tmp, JSON.stringify(value, null, 2), {mode: 0o600});
  await rename(tmp, config.dataPath);
}
export function readStore(fn) {
  return fn(data);
}
export function mutateStore(fn) {
  const task = queue.then(async () => {
    const next = structuredClone(data);
    const result = fn(next);
    await persist(next);
    data = next;
    return result;
  });
  queue = task.catch(() => {});
  return task;
}
export function nextId(rows) {
  return Math.max(0, ...rows.map(x => x.id)) + 1;
}
