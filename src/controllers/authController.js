import {randomBytes} from 'node:crypto';
import {config} from '../config.js';
import {User} from '../models/User.js';
import {hashPassword, verifyPassword, hashToken, publicUser} from '../services/password.js';
const fail = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
const cookieOptions = {path: '/', httpOnly: true, sameSite: 'lax', secure: config.production};
const validPassword = p => typeof p === 'string' && p.length >= 8 && p.length <= 128;
async function loginSession(res, user) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await User.createSession(user.id, hashToken(token), expiresAt);
  res.cookie('bapit_session', token, {...cookieOptions, maxAge: 7 * 86400000});
  return publicUser(user);
}
export async function signup(req, res) {
  const email = String(req.body.email || '')
      .trim()
      .toLowerCase(),
    name = String(req.body.name || '').trim(),
    password = req.body.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail('올바른 이메일을 입력해 주세요.');
  if (!name || name.length > 20) fail('닉네임은 1~20자로 입력해 주세요.');
  if (!validPassword(password)) fail('비밀번호는 8~128자로 입력해 주세요.');
  if (req.body.agree !== true) fail('개인정보 수집·이용에 동의해 주세요.');
  if (await User.findByEmail(email)) fail('이미 가입된 이메일입니다.', 409);
  const user = await User.create({email, name, password: await hashPassword(password)});
  res.status(201).json({user: await loginSession(res, user)});
}
export async function login(req, res) {
  const email = String(req.body.email || '')
      .trim()
      .toLowerCase(),
    password = req.body.password;
  if (typeof password !== 'string' || password.length > 128) fail('이메일 또는 비밀번호를 확인해 주세요.', 401);
  const u = await User.findByEmail(email);
  if (!u || !(await verifyPassword(password, u.password))) fail('이메일 또는 비밀번호를 확인해 주세요.', 401);
  res.json({user: await loginSession(res, u)});
}
export async function logout(req, res) {
  if (req.token) await User.removeSession(hashToken(req.token));
  res.clearCookie('bapit_session', cookieOptions);
  res.json({message: '로그아웃했어요.'});
}
export const me = (req, res) => res.json({user: publicUser(req.user)});
// 비밀번호 변경: 현재 비밀번호 확인 → 새 비밀번호 저장 → 다른 기기 로그인 해제
export async function changePassword(req, res) {
  const {currentPassword, newPassword} = req.body;
  const u = await User.findById(req.user.id);
  if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, u.password)))
    fail('현재 비밀번호가 맞지 않아요.', 401);
  if (!validPassword(newPassword)) fail('새 비밀번호는 8~128자로 입력해 주세요.');
  if (newPassword === currentPassword) fail('현재 비밀번호와 다른 비밀번호를 입력해 주세요.');
  await User.updatePassword(u.id, await hashPassword(newPassword), hashToken(req.token));
  res.json({message: '비밀번호를 변경했어요.'});
}
// 회원 탈퇴: 비밀번호 확인 후 계정과 모든 기록 삭제
export async function deleteAccount(req, res) {
  const u = await User.findById(req.user.id);
  if (typeof req.body.password !== 'string' || !(await verifyPassword(req.body.password, u.password)))
    fail('비밀번호가 맞지 않아요.', 401);
  await User.remove(u.id);
  res.clearCookie('bapit_session', cookieOptions);
  res.json({message: '탈퇴가 완료되었어요. 그동안 이용해 주셔서 감사해요.'});
}
