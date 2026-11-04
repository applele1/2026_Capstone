// 메뉴 이름을 보고 맵기(0~3)와 음식 특징을 붙입니다.
// Supabase menus 열 이름: 맵기, 시원함, 따뜻한, 바삭한, 건강한, 간편한, 거리m, 도보분
const TASTE_COLUMNS = ['맵기', '시원함', '따뜻한', '바삭한', '건강한', '간편한', '거리m', '도보분'];

const TRAITS = ['시원함', '따뜻한', '바삭한', '건강한', '간편한'];
const SPICE_OPTIONS = ['any', '0', '1', '2', '3'];
const WALK_OPTIONS = ['any', '10', '15'];
const SPICE_LABELS = ['안 매움', '약간 매움', '보통 매움', '매움'];

const SPICE_RULES = [
  [3, /마라|엽기|불닭|매운|얼큰|짬뽕|낚지|낙지|쭈꾸미|닭발|닭갈비|제육|육개장|스파이시|내슈빌|디아블로|맵징거|칰폴레|빨간라멘|순두부|김치찌개|부대찌개|닭볶음|닭도리|오삼|곱창|불냉면|불싸이|핫치킨|핫크리스피|핫\s*트러플/],
  [2, /떡볶이|라볶이|쫄면|쫄란|비빔|매콤|김치볶음|김치제육|사천/],
  [1, /로제|카레|김치/]
];

function classifyMenu(menu, { fallback = true } = {}) {
  const name = String(menu.name || '');
  let spice = 0;
  for (const [level, pattern] of SPICE_RULES) {
    if (pattern.test(name)) {
      spice = level;
      break;
    }
  }
  // 로제·크림 떡볶이는 빨간 떡볶이보다 순하게 봅니다.
  if (spice >= 2 && /로제|크림/.test(name) && !/마라|매운|엽기/.test(name)) spice = 1;

  const traits = new Set();
  const cool = /냉면|냉모밀|물냉|콩국수|냉콩|냉\s*파스타|샐러드|포케|사시미|초밥|스시|사케동|육회|열무/;
  if (cool.test(name)) traits.add('시원함');
  if (/찌개|국밥|탕|전골|곰탕|라면|라멘|우동|국수|칼국수|수제비|죽|찜|국물|볶음밥|덮밥|백반|정식|파스타|스파게티|그라탕|피자|된장|청국장|육개장|떡국|만두국|오므라이스|카레|술국|해장/.test(name)
    && !cool.test(name)
    && !/비빔|쫄면|열무/.test(name)) {
    traits.add('따뜻한');
  }
  if (/까스|가스|튀김|크리스피|크리스퍼|징거|탕수|꿔바|김말이|너겟|토스트|포테이토|감자튀김/.test(name)) traits.add('바삭한');
  if (/샐러드|포케|그레인|가슴살|아보카도|두부|베지|사시미|육회|연어|광어/.test(name)) traits.add('건강한');
  if (/김밥|주먹밥|토스트|버거|와퍼|샌드|랩|떡볶이|라면|라볶이|덮밥|도시락|퀘사디아|핫도그|징거|싸이/.test(name)) traits.add('간편한');

  if (fallback && traits.size === 0) {
    const fallback = {
      '샐러드&포케': ['건강한', '시원함'],
      분식: ['간편한'],
      패스트푸드: ['간편한'],
      면: ['따뜻한'],
      한식: ['따뜻한'],
      중식: ['따뜻한'],
      일식: ['따뜻한'],
      양식: ['따뜻한'],
      덮밥: ['따뜻한', '간편한']
    };
    const category = (menu.categories || [])[0];
    (fallback[category] || ['간편한']).forEach((trait) => traits.add(trait));
  }

  return { spice, traits: [...traits] };
}

// 특징이 DB에 저장돼 있으면 그 맵기·특징을 쓰고, 없으면 이름 분석 결과를 붙입니다.
function attachTaste(menu) {
  const inferred = classifyMenu(menu);
  const storedTraits = Array.isArray(menu.traits) && menu.traits.length ? menu.traits : null;
  const storedSpice = menu.spice == null || menu.spice === '' ? null : Number(menu.spice);
  return {
    ...menu,
    spice: storedTraits && Number.isInteger(storedSpice) ? storedSpice : inferred.spice,
    traits: storedTraits || inferred.traits
  };
}

function tasteFromRow(row) {
  const traits = TRAITS.filter((name) => row[name] === true);
  return attachTaste({
    ...row,
    spice: row['맵기'],
    traits,
    distanceMeters: row['거리m'],
    walkMinutes: row['도보분']
  });
}

module.exports = {
  TRAITS,
  TASTE_COLUMNS,
  SPICE_OPTIONS,
  WALK_OPTIONS,
  SPICE_LABELS,
  classifyMenu,
  attachTaste,
  tasteFromRow
};
