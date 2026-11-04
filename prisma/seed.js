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
  // 심층 추천용 메뉴 속성: 이미 있던 메뉴에도 속성만 갱신합니다. (숫자·true/false만 들어가므로 안전)
  const v=seed.menus.map(m=>`(${Number(m.id)},${Number(m.spicyLevel)},${Number(m.portionLevel)},${!!m.isRice},${!!m.isNoodle},${!!m.isSoup},${!!m.isMeat})`).join(',');
  await tx.$executeRawUnsafe(`UPDATE "menus" m SET "spicy_level"=v.s,"portion_level"=v.p,"is_rice"=v.r,"is_noodle"=v.n,"is_soup"=v.so,"is_meat"=v.me FROM (VALUES ${v}) AS v(id,s,p,r,n,so,me) WHERE m."id"=v.id`);
  await tx.tag.createMany({data:seed.tags, skipDuplicates:true});
  await tx.menuTag.createMany({data:seed.menuTags.map(([menuId,tagId])=>({menuId,tagId})), skipDuplicates:true});
  // id를 직접 넣었으므로 다음 자동 번호를 최댓값 뒤로 맞춥니다.
  for (const table of ['restaurants','menus','categories','tags'])
   await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${table}"','id'), COALESCE((SELECT MAX(id) FROM "${table}"),1), true)`);
 }, {timeout:60000});
 console.log(`시드 완료: 식당 ${seed.restaurants.length}곳 · 메뉴 ${seed.menus.length}개 · 카테고리 ${seed.categories.length}개 · 태그 ${seed.tags.length}개`);
 console.log('테스트 계정(관리자 + 회원 50명)은 npm run db:seed:test-users 로 넣습니다.');
} finally {
 await db.$disconnect();
}
