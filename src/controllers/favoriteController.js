const { store } = require('../models/store');
const { parseId } = require('../utils/validators');
const { asyncRoute } = require('../middleware/asyncRoute');

const listFavorites = asyncRoute(async (req, res) => {
  const ids = await store.listFavoriteIds(req.user.id);
  const restaurants = await store.listRestaurants();
  const favorites = restaurants
    .filter((r) => ids.includes(r.id))
    .map(({ id, name, categories, address, lat, lng }) => ({ id, name, category: categories[0], address, lat, lng }));
  res.json({ favorites });
});

const addFavorite = asyncRoute(async (req, res) => {
  await store.addFavorite(req.user.id, parseId(req.params.id));
  res.status(204).end();
});

const removeFavorite = asyncRoute(async (req, res) => {
  await store.removeFavorite(req.user.id, parseId(req.params.id));
  res.status(204).end();
});

module.exports = { listFavorites, addFavorite, removeFavorite };
