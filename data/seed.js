// 샘플 데이터입니다. 실제 학교 주변 식당 정보(이름, 좌표, 메뉴, 가격)로 교체해서 사용하세요.
// 좌표는 카카오맵에서 식당을 검색한 뒤 "좌표 복사" 또는 Kakao Local API로 얻을 수 있습니다.
module.exports = [
  {
    name: '계산동 집밥식당',
    category: '한식',
    emoji: '🍚',
    address: '인천 계양구 계산동 (샘플)',
    phone: '032-000-0001',
    description: '매일 바뀌는 반찬과 따뜻한 찌개가 있는 백반집',
    lat: 37.5409, lng: 126.7361,
    menus: [
      { name: '김치찌개 백반', price: 8000 },
      { name: '제육볶음 정식', price: 9000 },
      { name: '된장찌개', price: 7500 }
    ],
    reviews: [
      { nickname: '새내기', rating: 5, content: '반찬이 많고 집밥 느낌이라 좋아요.' },
      { nickname: '간호학과', rating: 4, content: '점심시간엔 조금 기다려야 해요.' }
    ]
  },
  {
    name: '학교앞 국밥',
    category: '한식',
    emoji: '🍲',
    address: '인천 계양구 계산동 (샘플)',
    phone: '032-000-0002',
    description: '든든한 순대국밥과 돼지국밥 전문점',
    lat: 37.5384, lng: 126.7378,
    menus: [
      { name: '순대국밥', price: 9000 },
      { name: '돼지국밥', price: 9500 },
      { name: '수육 소', price: 18000 }
    ],
    reviews: [
      { nickname: '국밥러버', rating: 5, content: '양이 많아서 저녁까지 배불러요.' },
      { nickname: '유아교육과', rating: 4, content: '깍두기가 맛있어요.' }
    ]
  },
  {
    name: '꼬마김밥 분식',
    category: '분식',
    emoji: '🍢',
    address: '인천 계양구 계산동 (샘플)',
    phone: '032-000-0003',
    description: '공강 시간에 빠르게 먹기 좋은 분식집',
    lat: 37.5402, lng: 126.7339,
    menus: [
      { name: '참치김밥', price: 4500 },
      { name: '떡볶이', price: 5000 },
      { name: '라볶이', price: 6500 },
      { name: '돈까스', price: 8500 }
    ],
    reviews: [
      { nickname: '공강파', rating: 4, content: '빨리 나와서 수업 전에 먹기 좋아요.' },
      { nickname: '떡순이', rating: 5, content: '떡볶이 국물이 진짜 맛있어요!' },
      { nickname: '익명', rating: 4, content: '가성비 최고.' }
    ]
  },
  {
    name: '라면공방',
    category: '분식',
    emoji: '🍜',
    address: '인천 계양구 계산동 (샘플)',
    phone: '032-000-0004',
    description: '토핑을 골라 먹는 라면 전문점',
    lat: 37.5418, lng: 126.7344,
    menus: [
      { name: '기본 라면', price: 4000 },
      { name: '치즈 라면', price: 5000 },
      { name: '라면 + 주먹밥 세트', price: 6500 }
    ],
    reviews: [
      { nickname: '면러버', rating: 4, content: '혼밥하기 편해요.' }
    ]
  },
  {
    name: '스시하루',
    category: '일식',
    emoji: '🍣',
    address: '인천 계양구 계산동 (샘플)',
    phone: '032-000-0005',
    description: '런치 초밥 세트가 인기인 일식집',
    lat: 37.5372, lng: 126.7330,
    menus: [
      { name: '런치 초밥 10pcs', price: 12000 },
      { name: '연어덮밥', price: 11000 },
      { name: '우동', price: 7000 }
    ],
    reviews: [
      { nickname: '연어좋아', rating: 5, content: '연어덮밥 두툼해요.' },
      { nickname: '디자인과', rating: 4, content: '분위기가 깔끔해요.' }
    ]
  },
  {
    name: '돈까스 연구소',
    category: '일식',
    emoji: '🍱',
    address: '인천 계양구 계산동 (샘플)',
    phone: '032-000-0006',
    description: '두툼한 수제 돈까스와 카레',
    lat: 37.5391, lng: 126.7322,
    menus: [
      { name: '로스까스', price: 9500 },
      { name: '카레 돈까스', price: 10000 },
      { name: '일본식 카레', price: 7500 }
    ],
    reviews: [
      { nickname: '까스까스', rating: 5, content: '바삭하고 고기가 두꺼워요.' },
      { nickname: '경영학과', rating: 4, content: '카레가 은근 맛있어요.' }
    ]
  },
  {
    name: '계산 짜장반점',
    category: '중식',
    emoji: '🥟',
    address: '인천 계양구 계산동 (샘플)',
    phone: '032-000-0007',
    description: '짜장면, 짬뽕, 탕수육 기본에 충실한 중식당',
    lat: 37.5413, lng: 126.7385,
    menus: [
      { name: '짜장면', price: 6000 },
      { name: '짬뽕', price: 7500 },
      { name: '볶음밥', price: 7500 },
      { name: '탕수육 소', price: 15000 }
    ],
    reviews: [
      { nickname: '짜장', rating: 4, content: '짜장면이 저렴하고 빨리 나와요.' },
      { nickname: '짬뽕', rating: 3, content: '짬뽕은 조금 짜요.' }
    ]
  },
  {
    name: '만두가게',
    category: '중식',
    emoji: '🥟',
    address: '인천 계양구 계산동 (샘플)',
    phone: '032-000-0008',
    description: '직접 빚는 왕만두와 마라탕',
    lat: 37.5365, lng: 126.7365,
    menus: [
      { name: '왕만두 5개', price: 5000 },
      { name: '마라탕(1인)', price: 9000 },
      { name: '꿔바로우 소', price: 13000 }
    ],
    reviews: [
      { nickname: '마라왕', rating: 5, content: '마라탕 재료 선택이 다양해요.' }
    ]
  },
  {
    name: '파스타 키친',
    category: '양식',
    emoji: '🍝',
    address: '인천 계양구 계산동 (샘플)',
    phone: '032-000-0009',
    description: '학생 할인 런치 파스타',
    lat: 37.5425, lng: 126.7370,
    menus: [
      { name: '알리오올리오', price: 9900 },
      { name: '토마토 파스타', price: 10900 },
      { name: '크림 리조또', price: 12900 }
    ],
    reviews: [
      { nickname: '파스타', rating: 4, content: '친구랑 기분 내고 싶을 때 가요.' },
      { nickname: '식영과', rating: 5, content: '크림 리조또 추천!' }
    ]
  },
  {
    name: '버거스탠드',
    category: '양식',
    emoji: '🍔',
    address: '인천 계양구 계산동 (샘플)',
    phone: '032-000-0010',
    description: '수제버거와 감자튀김',
    lat: 37.5380, lng: 126.7398,
    menus: [
      { name: '클래식 버거', price: 7500 },
      { name: '치즈버거 세트', price: 10500 },
      { name: '감자튀김', price: 3500 }
    ],
    reviews: [
      { nickname: '버거', rating: 4, content: '패티가 육즙이 많아요.' }
    ]
  },
  {
    name: '카페 봄날',
    category: '양식',
    emoji: '☕',
    address: '인천 계양구 계산동 (샘플)',
    phone: '032-000-0011',
    description: '공부하기 좋은 넓은 카페, 샌드위치 브런치',
    lat: 37.5400, lng: 126.7367,
    menus: [
      { name: '아메리카노', price: 2500 },
      { name: '카페라떼', price: 3500 },
      { name: '햄치즈 샌드위치', price: 5500 },
      { name: '브런치 플레이트', price: 9500 }
    ],
    reviews: [
      { nickname: '과제중', rating: 5, content: '콘센트 많고 조용해요.' },
      { nickname: '라떼', rating: 4, content: '아메리카노가 저렴해요.' }
    ]
  },
  {
    name: '베이글하우스',
    category: '양식',
    emoji: '🥯',
    address: '인천 계양구 계산동 (샘플)',
    phone: '032-000-0012',
    description: '매일 굽는 베이글과 크림치즈',
    lat: 37.5430, lng: 126.7330,
    menus: [
      { name: '플레인 베이글 + 크림치즈', price: 4500 },
      { name: '베이글 샌드위치', price: 7000 },
      { name: '아이스티', price: 3000 }
    ],
    reviews: [
      { nickname: '빵순이', rating: 4, content: '크림치즈 종류가 많아요.' }
    ]
  }
];
