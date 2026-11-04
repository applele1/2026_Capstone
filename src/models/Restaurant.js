import {config} from '../config.js';
import {db,readStore,readCatalog,mutateStore,nextId} from './store.js';
const pg=()=>config.storage==='postgres';
// 화면에서 쓰는 공통 모양: {id,name,address,lat,lng,menus:[{id,name,price,categoryIds}],reviews:[{...,user:{name}}]}
const fromDb=r=>({id:r.id,name:r.name,address:r.address,lat:r.lat,lng:r.lng,
 menus:r.menus.map(m=>({id:m.id,name:m.name,price:m.price,categoryIds:m.categories.map(c=>c.categoryId)})),
 reviews:r.reviews});
export const Restaurant={
 categories:async()=>pg()?db.category.findMany({orderBy:{id:'asc'}}):readCatalog(c=>c.categories),
 all:async()=>pg()
  ?(await db.restaurant.findMany({orderBy:{id:'asc'},include:{menus:{orderBy:{price:'asc'},include:{categories:{select:{categoryId:true}}}},reviews:{include:{user:{select:{name:true}}}}}})).map(fromDb)
  :readStore(d=>readCatalog(c=>c.restaurants.map(r=>({...r,reviews:d.reviews.filter(x=>x.restaurantId===r.id).map(x=>({...x,user:{name:d.users.find(u=>u.id===x.userId)?.name||'학생'}}))})))),
 favoriteIds:async userId=>pg()?(await db.favorite.findMany({where:{userId}})).map(x=>x.restaurantId):readStore(d=>d.favorites.filter(x=>x.userId===userId).map(x=>x.restaurantId)),
 setFavorite:async(userId,restaurantId,saved)=>{
  if(pg())return saved?db.favorite.upsert({where:{userId_restaurantId:{userId,restaurantId}},create:{userId,restaurantId},update:{}}):db.favorite.deleteMany({where:{userId,restaurantId}});
  return mutateStore(d=>{d.favorites=d.favorites.filter(x=>!(x.userId===userId&&x.restaurantId===restaurantId));if(saved)d.favorites.push({userId,restaurantId,createdAt:new Date().toISOString()});});
 },
 recentIds:async userId=>pg()?(await db.recentView.findMany({where:{userId},orderBy:{viewedAt:'desc'},take:20})).map(x=>x.restaurantId):readStore(d=>d.recentViews.filter(x=>x.userId===userId).sort((a,b)=>b.viewedAt.localeCompare(a.viewedAt)).slice(0,20).map(x=>x.restaurantId)),
 touch:async(userId,restaurantId)=>{
  if(pg())return db.recentView.upsert({where:{userId_restaurantId:{userId,restaurantId}},create:{userId,restaurantId},update:{viewedAt:new Date()}});
  return mutateStore(d=>{d.recentViews=d.recentViews.filter(x=>!(x.userId===userId&&x.restaurantId===restaurantId));d.recentViews.push({userId,restaurantId,viewedAt:new Date().toISOString()});});
 },
 // 후기 수정 시 작성일(createdAt)은 유지하고 수정일(updatedAt)만 기록합니다.
 review:async(userId,restaurantId,rating,comment)=>{
  if(pg())return db.review.upsert({where:{userId_restaurantId:{userId,restaurantId}},create:{userId,restaurantId,rating,comment},update:{rating,comment,updatedAt:new Date()}});
  return mutateStore(d=>{const now=new Date().toISOString();let r=d.reviews.find(x=>x.userId===userId&&x.restaurantId===restaurantId);if(r)Object.assign(r,{rating,comment,updatedAt:now});else{r={id:nextId(d.reviews),userId,restaurantId,rating,comment,createdAt:now,updatedAt:null};d.reviews.push(r);}return r;});
 },
 removeReview:async(userId,restaurantId)=>{
  if(pg())return (await db.review.deleteMany({where:{userId,restaurantId}})).count;
  return mutateStore(d=>{const before=d.reviews.length;d.reviews=d.reviews.filter(x=>!(x.userId===userId&&x.restaurantId===restaurantId));return before-d.reviews.length;});
 }
};
