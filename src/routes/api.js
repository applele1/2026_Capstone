const router = require('express').Router();
const { requireUser } = require('../middleware/auth');
const configController = require('../controllers/configController');
const restaurantController = require('../controllers/restaurantController');
const authController = require('../controllers/authController');
const favoriteController = require('../controllers/favoriteController');
const userController = require('../controllers/userController');

router.get('/config', configController.getConfig);

router.get('/restaurants', restaurantController.listRestaurants);
router.get('/restaurants/:id/reviews', restaurantController.listReviews);
router.post('/restaurants/:id/reviews', requireUser, restaurantController.addReview);

router.post('/auth/signup', authController.signup);
router.post('/auth/login', authController.login);

router.get('/favorites', requireUser, favoriteController.listFavorites);
router.post('/favorites/:id', requireUser, favoriteController.addFavorite);
router.delete('/favorites/:id', requireUser, favoriteController.removeFavorite);

router.get('/me', requireUser, userController.getMe);
router.patch('/me', requireUser, userController.updateMe);
router.patch('/me/password', requireUser, userController.updatePassword);
router.delete('/me', requireUser, userController.deleteMe);
router.get('/me/reviews', requireUser, userController.listMyReviews);
router.patch('/me/reviews/:id', requireUser, userController.updateMyReview);
router.delete('/me/reviews/:id', requireUser, userController.deleteMyReview);

module.exports = router;
