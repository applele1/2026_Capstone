import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {PrismaClient} from '@prisma/client';
// 엑셀(2026-10-08)에서 옮긴 실제 식당·메뉴·카테고리 데이터를 넣습니다.
// 이미 같은 id가 있으면 건너뛰므로 Supabase에 직접 넣어 둔 데이터를 덮어쓰지 않습니다.
const seed = JSON.parse(await readFile(new URL('../data/seed/bapit-data.json', import.meta.url), 'utf8'));
const db = new PrismaClient();
try {
 await db.$transaction(async tx => {
  await tx.category.createMany({data:seed.categories, skipDuplicates:true});
  await tx.restaurant.createMany({data:seed.restaurants, skipDuplicates:true});
  await tx.menu.createMany({data:seed.menus, skipDuplicates:true});
  await tx.menuCategory.createMany({data:seed.menuCategories.map(([menuId,categoryId])=>({menuId,categoryId})), skipDuplicates:true});
  // id를 직접 넣었으므로 다음 자동 번호를 최댓값 뒤로 맞춥니다.
  for (const table of ['restaurants','menus','categories'])
   await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${table}"','id'), COALESCE((SELECT MAX(id) FROM "${table}"),1), true)`);
 }, {timeout:60000});
 console.log(`시드 완료: 식당 ${seed.restaurants.length}곳 · 메뉴 ${seed.menus.length}개 · 카테고리 ${seed.categories.length}개`);
} finally {
 await db.$disconnect();
}
