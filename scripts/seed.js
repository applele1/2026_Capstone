require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const seed = require('../data/seed');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('.env 에 SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 를 먼저 설정하세요.');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { count, error: countError } = await supabase
    .from('restaurants')
    .select('id', { count: 'exact', head: true });
  if (countError) throw countError;
  if (count > 0 && !process.argv.includes('--force')) {
    console.log(`restaurants 테이블에 이미 ${count}개의 데이터가 있어 시드를 건너뜁니다. (덮어쓰려면 npm run seed -- --force)`);
    return;
  }
  if (count > 0) {
    const { error } = await supabase.from('restaurants').delete().gt('id', 0);
    if (error) throw error;
  }

  for (const { menus, reviews, ...restaurant } of seed) {
    const { data, error } = await supabase.from('restaurants').insert(restaurant).select('id').single();
    if (error) throw error;

    const { error: menuError } = await supabase
      .from('menus')
      .insert(menus.map((m) => ({ ...m, restaurant_id: data.id })));
    if (menuError) throw menuError;

    if (reviews?.length) {
      const { error: reviewError } = await supabase
        .from('reviews')
        .insert(reviews.map((r) => ({ ...r, restaurant_id: data.id })));
      if (reviewError) throw reviewError;
    }
    console.log(`✓ ${restaurant.name}`);
  }
  console.log(`완료: ${seed.length}개 식당을 등록했습니다.`);
}

main().catch((err) => {
  console.error('시드 실패:', err.message || err);
  process.exit(1);
});
