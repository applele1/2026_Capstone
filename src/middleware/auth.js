const { store } = require('../models/store');
const { HttpError } = require('../utils/httpError');
const { asyncRoute } = require('./asyncRoute');

async function optionalUser(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  return token ? store.getUser(token) : null;
}

const requireUser = asyncRoute(async (req, res, next) => {
  const user = await optionalUser(req);
  if (!user) throw new HttpError(401, '로그인이 필요해요.');
  req.user = user;
  next();
});

module.exports = { optionalUser, requireUser };
