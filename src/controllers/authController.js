import {randomBytes} from 'node:crypto';
import {config} from '../config.js';
import {User} from '../models/User.js';
import {hashPassword,verifyPassword,hashToken,publicUser} from '../services/password.js';
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
async function loginSession(res,user){const token=randomBytes(32).toString('hex');const expiresAt=new Date(Date.now()+7*86400000);await User.createSession(user.id,hashToken(token),expiresAt);res.cookie('bapit_session',token,{httpOnly:true,sameSite:'lax',secure:config.production,maxAge:7*86400000,path:'/'});return publicUser(user);}
export async function signup(req,res){const email=String(req.body.email||'').trim().toLowerCase(),name=String(req.body.name||'').trim(),password=req.body.password;if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail('올바른 이메일을 입력해 주세요.');if(!name||name.length>20)fail('닉네임은 1~20자로 입력해 주세요.');if(typeof password!=='string'||password.length<8||password.length>128)fail('비밀번호는 8~128자로 입력해 주세요.');if(await User.findByEmail(email))fail('이미 가입된 이메일입니다.',409);const user=await User.create({email,name,password:await hashPassword(password)});res.status(201).json({user:await loginSession(res,user)});}
export async function login(req,res){const email=String(req.body.email||'').trim().toLowerCase(),password=req.body.password;if(typeof password!=='string'||password.length>128)fail('이메일 또는 비밀번호를 확인해 주세요.',401);const u=await User.findByEmail(email);if(!u||!await verifyPassword(password,u.password))fail('이메일 또는 비밀번호를 확인해 주세요.',401);res.json({user:await loginSession(res,u)});}
export async function logout(req,res){if(req.token)await User.removeSession(hashToken(req.token));res.clearCookie('bapit_session',{path:'/',httpOnly:true,sameSite:'lax',secure:config.production});res.json({message:'로그아웃했어요.'});}
export const me=(req,res)=>res.json({user:publicUser(req.user)});
