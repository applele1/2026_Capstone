const SCHOOL = {
  name: '경인여자대학교',
  lat: Number(process.env.SCHOOL_LAT) || 37.5484997,
  lng: Number(process.env.SCHOOL_LNG) || 126.7228094
};

const CATEGORIES = ['all', '한식', '일식', '중식', '분식', '양식', '패스트푸드', '면', '덮밥', '샐러드&포케'];

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  SCHOOL,
  CATEGORIES
};
