const { store } = require('../models/store');
const { readCredentials, readNickname } = require('../utils/validators');
const { asyncRoute } = require('../middleware/asyncRoute');

const signup = asyncRoute(async (req, res) => {
  const { email, password } = readCredentials(req.body);
  const nickname = readNickname(req.body);
  res.status(201).json(await store.signUp(email, password, nickname));
});

const login = asyncRoute(async (req, res) => {
  const { email, password } = readCredentials(req.body);
  res.json(await store.signIn(email, password));
});

module.exports = { signup, login };
