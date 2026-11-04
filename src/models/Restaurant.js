import {config} from '../config.js';
import {db,readStore,mutateStore,nextId} from './store.js';
export const Restaurant={
 all:async()=>config.storage==='postgres'?db.restaurant.findMany({include:{menus:true,reviews:{include:{user:{select:{name:true}}}}}}):readStore(d=>d.restaurants.map(r=>({...r,reviews:d.reviews.filter(x=>x.restaurantId===r.id).map(x=>({...x,user:{name:d.users.find(u=>u.id===x.userId)?.name || '학생'}}))}))),
 favoriteIds:async userId=>config.storage==='postgres'?(await db.favorite.findMany({where:{userId}})).map(x=>x.restaurantId):readStore(d=>d.favorites.filter(x=>x.userId===userId).map(x=>x.restaurantId)),
 setFavorite:async(userId,restaurantId,saved)=>{
  if(config.storage==='postgres')return saved?db.favorite.upsert({where:{userId_restaurantId:{userId,restaurantId}},create:{userId,restaurantId},update:{}}):db.favorite.deleteMany({where:{userId,restaurantId}});
  return mutateStore(d=>{d.favorites=d.favorites.filter(x=>!(x.userId===userId&&x.restaurantId===restaurantId));if(saved)d.favorites.push({userId,restaurantId,createdAt:new Date().toISOString()});});
 },
 recentIds:async userId=>config.storage==='postgres'?(await db.recentView.findMany({where:{userId},orderBy:{viewedAt:'desc'},take:20})).map(x=>x.restaurantId):readStore(d=>d.recentViews.filter(x=>x.userId===userId).sort((a,b)=>b.viewedAt.localeCompare(a.viewedAt)).slice(0,20).map(x=>x.restaurantId)),
 touch:async(userId,restaurantId)=>{
  if(config.storage==='postgres')return db.recentView.upsert({where:{userId_restaurantId:{userId,restaurantId}},create:{userId,restaurantId},update:{viewedAt:new Date()}});
  return mutateStore(d=>{d.recentViews=d.recentViews.filter(x=>!(x.userId===userId&&x.restaurantId===restaurantId));d.recentViews.push({userId,restaurantId,viewedAt:new Date().toISOString()});});
 },
 review:async(userId,restaurantId,rating,comment)=>{
  if(config.storage==='postgres')return db.review.upsert({where:{userId_restaurantId:{userId,restaurantId}},create:{userId,restaurantId,rating,comment},update:{rating,comment,createdAt:new Date()}});
  return mutateStore(d=>{let r=d.reviews.find(x=>x.userId===userId&&x.restaurantId===restaurantId);if(!r){r={id:nextId(d.reviews),userId,restaurantId};d.reviews.push(r);} Object.assign(r,{rating,comment,createdAt:new Date().toISOString()});return r;});
 }
};
