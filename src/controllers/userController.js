const { store } = require('../models/store');
const { HttpError } = require('../utils/httpError');
const { parseId, readReview, readNickname } = require('../utils/validators');
const { asyncRoute } = require('../middleware/asyncRoute');

function getMe(req, res) {
  res.json({ user: req.user });
}

const updateMe = asyncRoute(async (req, res) => {
  res.json({ user: await store.updateNickname(req.user.id, readNickname(req.body)) });
});

const updatePassword = asyncRoute(async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < 6) throw new HttpError(400, '새 비밀번호는 6자 이상이어야 해요.');
  if (currentPassword === newPassword) throw new HttpError(400, '지금과 다른 비밀번호로 바꿔 주세요.');
  try {
    await store.signIn(req.user.email, currentPassword);
  } catch {
    throw new HttpError(400, '현재 비밀번호가 올바르지 않아요.');
  }
  await store.updatePassword(req.user.id, newPassword);
  res.status(204).end();
});

const deleteMe = asyncRoute(async (req, res) => {
  const password = String(req.body?.password || '');
  try {
    await store.signIn(req.user.email, password);
  } catch {
    throw new HttpError(400, '비밀번호가 올바르지 않아요.');
  }
  await store.deleteUser(req.user.id);
  res.status(204).end();
});

const listMyReviews = asyncRoute(async (req, res) => {
  res.json({ reviews: await store.listUserReviews(req.user.id) });
});

const updateMyReview = asyncRoute(async (req, res) => {
  const reviewId = parseId(req.params.id, '후기');
  res.json({ review: await store.updateReview(req.user.id, reviewId, readReview(req.body)) });
});

const deleteMyReview = asyncRoute(async (req, res) => {
  await store.deleteReview(req.user.id, parseId(req.params.id, '후기'));
  res.status(204).end();
});

module.exports = { getMe, updateMe, updatePassword, deleteMe, listMyReviews, updateMyReview, deleteMyReview };
