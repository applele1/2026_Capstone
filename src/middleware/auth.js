import {User} from '../models/User.js';
import {hashToken} from '../services/password.js';
export async function loadUser(req,res,next){const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('bapit_session='));req.token=cookie?.slice(14);req.user=req.token?await User.sessionUser(hashToken(req.token)):null;next();}
export function requireUser(req,res,next){if(!req.user)return res.status(401).json({message:'로그인이 필요합니다.'});next();}
// 동일 출처 쿠키 인증: 외부 웹페이지에서 보내는 쓰기 요청 차단
export function sameOrigin(req,res,next){if(['GET','HEAD','OPTIONS'].includes(req.method))return next();const origin=req.headers.origin;if(origin){try{if(new URL(origin).host!==req.headers.host)return res.status(403).json({message:'허용되지 않은 요청입니다.'});}catch{return res.status(403).json({message:'허용되지 않은 요청입니다.'});}}if(req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({message:'허용되지 않은 요청입니다.'});if(!req.is('application/json'))return res.status(415).json({message:'JSON 요청이 필요합니다.'});next();}
