// 메뉴 이름(+카테고리)으로 심층 추천용 속성을 자동으로 붙이는 규칙입니다.
// 결과는 data/seed/bapit-data.json과 supabase/02_seed_catalog.sql에 저장되며,
// 이후에는 Supabase 테이블 편집기에서 메뉴별로 직접 고쳐도 됩니다.
//
// spicy_level   0 안 매움 · 1 살짝 · 2 매콤 · 3 아주 매움
// portion_level 1 가볍게 · 2 보통 · 3 든든하게
// is_rice / is_noodle / is_soup / is_meat
// tags          뜨끈한 · 시원한 · 바삭한 · 치즈 · 해산물 · 건강한 · 간편한

export const TAGS = ['뜨끈한', '시원한', '바삭한', '치즈', '해산물', '건강한', '간편한'];

const has = (name, words) => words.some(w => name.includes(w));

const SPICY3 = ['불닭', '엽기', '마라', '매운무뼈', '매운짬뽕', '불냉면'];
const SPICY2 = ['매콤', '짬면', '얼큰', '짬뽕', '떡볶이', '라볶이', '쫄란볶이', '김치찌개', '부대', '육개장', '닭발', '닭갈비', '제육', '오삼', '낚지', '쭈꾸미',
  '닭볶음탕', '닭도리탕', '뚝볶음탕', '곱창', '핫', '불싸이', '맵징거', '디아블로', '빨간라멘', '뼈해장국', '동태탕', '비빔냉면', '비빔국수', '쫄면', '순두부',
  '오징어덮밥', '사천', '아라비아따', '멕시칸', '불육회', '숯불무뻐', '닭내장', '도니지곱창', '김치칼국수', '불앗'];
const SPICY1 = ['김치', '스파이시', '칠리', '라면', '비빔', '열무', '짬짜면', '청국장', '엘파소', '치폴레', '내장탕', '선지'];
const MILD = ['담백', '간장', '크림', '로제', '짜장', '울면', '기스면'];

function spicyLevel(name, restaurantId) {
  let level = has(name, SPICY3) ? 3 : has(name, SPICY2) ? 2 : has(name, SPICY1) ? 1 : 0;
  if (restaurantId === 26 && name.includes('세트')) level = 3;   // 엽기떡볶이 세트
  if (has(name, ['로제', '크림']) && level > 0) level -= 1;              // 크림로제떡볶이 → 살짝
  if (has(name, ['담백', '간장']) && !has(name, SPICY3)) level = 0;        // 간장뚝볶음탕, 한방닭곰탕 담백
  if (has(name, ['짜장', '울면', '기스면']) && !has(name, ['짬뽕', '짬짜', '사천'])) level = 0;
  return level;
}

const NOODLE = ['면', '국수', '라면', '우동', '라멘', '소바', '모밀', '메밀', '쫄면', '파스타', '스파게티', '짬뽕', '짜장', '냉면', '칼국수', '수제비', '라볶이', '쫄란', '울면'];
function isNoodle(name, categories) {
  if (/\+\s*우동/.test(name)) return false;                // 초밥+우동(소소) 세트는 초밥이 주메뉴
  if (has(name, ['짬뽕밥', '짜장밥', '볶음밥', '탕볶밥'])) return false;
  return categories.includes('면') || has(name, NOODLE);
}

const RICE = ['밥', '덮밥', '규동', '사케동', '카이센동', '라이스', '카레', '김밥', '오므라이스', '초밥', '백반', '정식', '국밥', '죽', '포케', '찌개', '순대국',
  '해장국', '곰탕', '갈비탕', '육개장', '청국장', '순두부', '마요', '사시미', '도가니탕', '내장탕', '동태탕', '들깨우거지탕', '소내장탕', '뚝불고기', '뚝배기', '술국', '부대찌개', '부대국밥', '설렁탕'];
function isRice(name, categories) {
  if (has(name, ['카레우동', '메밀면', '파스타'])) return false;
  if (has(name, ['마요']) && has(name, ['쫄면', '랩', '에그마요', '연어깍두기'])) return false;
  if (categories.includes('덮밥') || /\+\s*우동/.test(name)) return true;   // 초밥+우동 세트
  return has(name, RICE) && !(categories.includes('패스트푸드'));
}

const SOUP = ['국', '탕', '찌개', '육개장', '라면', '우동', '칼국수', '수제비', '짬뽕', '라멘', '물냉면', '열무냉면', '콩국수', '모밀', '전골', '죽', '순두부', '청국장', '묵밥', '울면', '기스면', '닭곰탕', '닭칼국수', '국물'];
function isSoup(name) {
  const n = name.replace(/탕수육|탕짜|탕볶|그라탕/g, '');           // 탕수육 세트·그라탕은 국물 아님
  if (has(n, ['비빔', '볶이', '쫄면', '볶음밥', '짜장밥', '카레우동', '마제', '덮밥', '막국수'])) return has(n, ['짬뽕밥', '국밥', '+우동']);
  return has(n, SOUP);
}

const MEAT = ['고기', '돼지', '쇠고기', '소고기', '불고기', '제육', '돈까스', '치킨', '닭', '함박', '스테이크', '갈비', '삼겹', '목살', '항정', '차돌', '규동', '육회',
  '곱창', '내장', '순대', '수육', '편육', '머릿고기', '감투', '뽈살', '소머리', '선지', '도가니', '곰탕', '사골', '베이컨', '햄', '스팸', '잠봉', '페퍼로니', '미트', '비프',
  '포크', '오리', '동파육', '부채살', '안창', '육개장', '부대', '뼈', '징거', '싸이', '휠렛', '트위스터', '데리', '비엘티', '비엠티', '이탈리안', '클럽', '와퍼', '꿔바로우',
  '탕수육', '바베큐', '숯', '무한리필', '볶음탕', '맥시멈', '크리스퍼', '직화', '로티세리', '오삼', '술국', '우삼겹', '버거', '퀘사디아', '콤비네이션', '까스'];
function isMeat(name) {
  if (has(name, ['생선까스', '베지', '두부 버섯', '그린 그레인'])) return false;
  if (has(name, ['새우', '쉬림프', '씨푸드']) && !has(name, ['불고기', '와퍼', '싸이', '치킨', '비프', '스테이크', '닭', '베이컨'])) return false;
  if (has(name, ['비프퀘사디아', '치킨퀘사디아'])) return true;
  if (has(name, ['야채퀘사디아'])) return false;
  return has(name.replace(/불닭/g, ''), MEAT);   // '불닭'은 소스 이름
}

const LIGHT = ['김밥', '주먹밥', '주먹김밥', '샐러드', '포케', '랩', '미니', '죽', '어린이', '계란말이', '군만두', '토스트', '햄치즈', '에그', '베지', '트위스터(단품)'];
const HEAVY = ['세트', '(특)', '무한리필', '정식', '+밥', '+우동', '고기반반', '몬스터', '맥시멈', '더블', '국밥', '순대국', '해장국', '함박', '부대', '갈비탕', '도가니탕',
  '백반', '제육많이', '피자', '1인분', '곱창', '닭갈비', '돈까스', '술국', '수육', '편육', '타워'];
function portionLevel(name, restaurantId) {
  if (restaurantId === 33) return 1;                          // 이삭토스트
  if (has(name, ['샐러드', '포케', '랩'])) return 1;
  if (restaurantId === 15) return 2;                          // 써브웨이 샌드위치
  if (has(name, ['더블다운', '타워']) || has(name, HEAVY)) return has(name, ['미니', '어린이']) ? 1 : 3;
  if (has(name, LIGHT)) return 1;
  return 2;
}

const QUICK_RESTAURANTS = new Set([12, 15, 33]);              // 한솥도시락, 써브웨이, 이삭토스트
function tagsOf(name, restaurantId, categories, attrs) {
  const tags = [];
  const cold = has(name, ['냉', '콩국수', '열무', '모밀', '묵밥(냉', '막국수']);
  if (attrs.is_soup && !cold) tags.push('뜨끈한');
  if (cold) tags.push('시원한');
  if (has(name, ['까스', '튀김', '징거', '크리스피', '크리스퍼', '싸이', '꿔바로우', '탕수육', '치킨버거', '통새우', '군만두', '깐쇼', '휠렛', '트위스터', '새우버거', '데리야킹'])) tags.push('바삭한');
  if (has(name, ['치즈', '고르곤졸라', '모짜렐라', '그라탕', '피자', '퀘사디아'])) tags.push('치즈');
  if (has(name, ['새우', '쉬림프', '연어', '오징어', '해물', '바지락', '참치', '카이센', '사케', '명란', '사시미', '장어', '쭈꾸미', '낚지', '갈치', '동태', '삼선', '짬뽕', '씨푸드', '멸치', '광어', '생선', '어묵', '깐쇼'])
    || (name.includes('초밥') && !has(name, ['육회초밥', '스테이크초밥', '소고기초밥', '어린이']))) tags.push('해산물');
  if (has(name, ['샐러드', '포케', '비빔밥', '두부', '베지', '그린', '야채', '콩국수', '메밀', '모밀', '묵밥', '죽', '백반', '청국장', '된장'])) tags.push('건강한');
  if (QUICK_RESTAURANTS.has(restaurantId) || has(name, ['김밥', '주먹밥', '랩', '토스트'])) tags.push('간편한');
  return [...new Set(tags)];
}

export function attributesOf(menu, categoryNames) {
  // '후덕죽(셰프 이름)'·'숯불'처럼 오해하기 쉬운 글자를 먼저 정리합니다. (숯불닭 → 불닭 소스 아님)
  const name = menu.name.replace(/후덕죽/g, '후덕').replace(/숯불/g, '숯');
  const attrs = {
    spicy_level: spicyLevel(name, menu.restaurantId),
    is_rice: isRice(name, categoryNames),
    is_noodle: isNoodle(name, categoryNames),
    is_soup: isSoup(name),
    is_meat: isMeat(name),
    portion_level: portionLevel(name, menu.restaurantId)
  };
  attrs.tags = tagsOf(name, menu.restaurantId, categoryNames, attrs);
  return attrs;
}
