import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import * as auth from '../controllers/authController.js';
import * as restaurant from '../controllers/restaurantController.js';
import * as map from '../controllers/mapController.js';
import * as deep from '../controllers/deepController.js';
import {loadUser,requireUser,requireAdmin,sameOrigin} from '../middleware/auth.js';
export const api=Router();api.use(sameOrigin,loadUser);
const limited=message=>({standardHeaders:'draft-8',legacyHeaders:false,message:{message}});
const authLimit=rateLimit({windowMs:15*60000,limit:30,...limited('요청이 많습니다. 잠시 후 다시 시도해 주세요.')});
// 후기 도배 방지: 계정당 10분에 10번까지 저장·삭제
const reviewLimit=rateLimit({windowMs:10*60000,limit:10,keyGenerator:req=>'user:'+req.user.id,...limited('후기를 너무 자주 저장했어요. 잠시 후 다시 시도해 주세요.')});
api.get('/auth/me',auth.me);api.post('/auth/signup',authLimit,auth.signup);api.post('/auth/login',authLimit,auth.login);api.post('/auth/logout',auth.logout);
api.put('/auth/password',requireUser,authLimit,auth.changePassword);api.delete('/auth/account',requireUser,authLimit,auth.deleteAccount);
api.get('/categories',restaurant.categories);
api.get('/restaurants',restaurant.list);api.get('/restaurants/:id',restaurant.detail);api.put('/restaurants/:id/favorite',requireUser,restaurant.favorite);
api.post('/restaurants/:id/reviews',requireUser,reviewLimit,restaurant.review);api.delete('/restaurants/:id/reviews',requireUser,reviewLimit,restaurant.removeReview);
api.get('/me/favorites',requireUser,restaurant.favorites);api.get('/me/recent',requireUser,restaurant.recent);api.get('/map/config',map.mapConfig);api.get('/map/places',requireUser,rateLimit({windowMs:60000,limit:15}),map.searchPlaces);
// 심층 추천 · 행동 기록 · 관리자
const trackLimit=rateLimit({windowMs:10*60000,limit:120,keyGenerator:req=>'user:'+req.user.id,...limited('요청이 많습니다. 잠시 후 다시 시도해 주세요.')});
api.get('/recommend/options',deep.options);api.get('/recommend/parse',rateLimit({windowMs:60000,limit:30,...limited('요청이 많습니다. 잠시 후 다시 시도해 주세요.')}),deep.parse);api.get('/recommend/deep',deep.recommend);
api.post('/interactions',requireUser,trackLimit,deep.track);
api.get('/admin/users',requireAdmin,deep.adminUsers);api.get('/admin/stats',requireAdmin,deep.adminStats);
