const { HttpError } = require('./httpError');

function parseId(value, label = '식당') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `잘못된 ${label} ID예요.`);
  return id;
}

function readReview(body) {
  const rating = Number(body.rating);
  const content = String(body.content || '').trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, '별점을 선택해 주세요.');
  if (!content || content.length > 300) throw new HttpError(400, '리뷰는 1~300자로 입력해 주세요.');
  return { rating, content };
}

function readNickname(body) {
  const nickname = String(body.nickname || '').trim();
  if (!nickname || nickname.length > 20) throw new HttpError(400, '닉네임은 1~20자로 입력해 주세요.');
  return nickname;
}

function readCredentials(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, '올바른 이메일을 입력해 주세요.');
  if (password.length < 6) throw new HttpError(400, '비밀번호는 6자 이상이어야 해요.');
  return { email, password };
}

module.exports = { parseId, readReview, readNickname, readCredentials };
