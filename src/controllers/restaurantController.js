import {Restaurant} from '../models/Restaurant.js';
import {Interaction} from '../models/Interaction.js';
import {config} from '../config.js';
import {recommend,summarize,detailMenus,representativeItem,emojiOf} from '../services/recommendation.js';
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
async function find(id){const row=(await Restaurant.all()).find(r=>r.id===Number(id));if(!row)fail('식당을 찾을 수 없습니다.',404);return row;}
export async function categories(req,res){res.json({items:(await Restaurant.categories()).map(c=>({id:c.id,name:c.name,emoji:emojiOf(c.name)}))});}
export async function list(req,res){
 const budget=Number(req.query.budget??10000),category=String(req.query.category||'all'),sort=req.query.sort||'recommend',query=String(req.query.q||'').trim();
 if(!Number.isInteger(budget)||budget<3000||budget>30000)fail('예산은 3,000~30,000원 사이로 입력해 주세요.');
 if(query.length>30)fail('검색어는 30자 이내로 입력해 주세요.');
 const cats=await Restaurant.categories();
 if((category!=='all'&&!cats.some(c=>String(c.id)===category))||!['recommend','price','distance'].includes(sort))fail('검색 조건을 확인해 주세요.');
 const rows=recommend(await Restaurant.all(),{budget,category,sort,query},config.school,cats);
 const ids=req.user?await Restaurant.favoriteIds(req.user.id):[];
 res.json({items:rows.map(r=>({...r,saved:ids.includes(r.restaurantId)})),total:rows.length});
}
export async function detail(req,res){
 const row=await find(req.params.id),cats=await Restaurant.categories();
 // 로그인한 경우 최근 본 식당 + 행동 기록(view)을 남깁니다. (심층 추천의 개인 취향에 사용)
 if(req.user)await Promise.all([Restaurant.touch(req.user.id,row.id),Interaction.log(req.user.id,{restaurantId:row.id,type:'view'})]);
 const saved=req.user?(await Restaurant.favoriteIds(req.user.id)).includes(row.id):false;
 res.json({restaurant:{...summarize(row,config.school,cats),menus:detailMenus(row,cats),saved},
  reviews:row.reviews.map(v=>({id:v.id,userId:v.userId,name:v.user.name,rating:v.rating,comment:v.comment,createdAt:v.createdAt,updatedAt:v.updatedAt||null})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))});
}
async function mine(req,ids,savedIds){const [rows,cats]=await Promise.all([Restaurant.all(),Restaurant.categories()]);return ids.map(id=>rows.find(r=>r.id===id)).filter(Boolean).map(r=>({...representativeItem(r,config.school,cats),saved:savedIds.includes(r.id)}));}
export async function favorites(req,res){const ids=await Restaurant.favoriteIds(req.user.id);res.json({items:await mine(req,ids,ids)});}
export async function recent(req,res){const [ids,saved]=await Promise.all([Restaurant.recentIds(req.user.id),Restaurant.favoriteIds(req.user.id)]);res.json({items:await mine(req,ids,saved)});}
export async function favorite(req,res){const r=await find(req.params.id);const saved=req.body.saved;if(typeof saved!=='boolean')fail('saved는 true 또는 false여야 합니다.');await Restaurant.setFavorite(req.user.id,r.id,saved);res.json({saved});}
export async function review(req,res){const r=await find(req.params.id),rating=req.body.rating,comment=String(req.body.comment||'').trim();if(!Number.isInteger(rating)||rating<1||rating>5)fail('별점은 1~5점으로 선택해 주세요.');if(!comment||comment.length>300)fail('후기는 1~300자로 입력해 주세요.');await Restaurant.review(req.user.id,r.id,rating,comment);res.status(201).json({message:'후기를 저장했어요.'});}
export async function removeReview(req,res){const r=await find(req.params.id);if(!await Restaurant.removeReview(req.user.id,r.id))fail('삭제할 후기가 없습니다.',404);res.json({message:'후기를 삭제했어요.'});}
