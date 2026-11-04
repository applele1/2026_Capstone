const { store } = require('../models/store');
const { SCHOOL } = require('../config');

function getConfig(req, res) {
  res.json({ kakaoKey: process.env.KAKAO_JS_KEY || null, school: SCHOOL, mode: store.mode });
}

module.exports = { getConfig };
