import {config} from '../config.js';
import {db, readStore, mutateStore, nextId} from './store.js';
const pg = () => config.storage === 'postgres';
export const User = {
  findByEmail: async email =>
    pg() ? db.user.findUnique({where: {email}}) : readStore(d => d.users.find(x => x.email === email)),
  findById: async id => (pg() ? db.user.findUnique({where: {id}}) : readStore(d => d.users.find(x => x.id === id))),
  // 관리자 화면: 회원 목록 (비밀번호 해시는 내보내지 않습니다)
  list: async () =>
    pg()
      ? await db.user.findMany({
          orderBy: {id: 'asc'},
          select: {id: true, email: true, name: true, role: true, createdAt: true}
        })
      : readStore(d =>
          d.users.map(({id, email, name, role, createdAt}) => ({id, email, name, role: role || 'user', createdAt}))
        ),
  create: async fields => {
    if (pg()) return db.user.create({data: fields});
    return mutateStore(d => {
      if (d.users.some(x => x.email === fields.email)) {
        const e = new Error('이미 가입된 이메일입니다.');
        e.status = 409;
        throw e;
      }
      const user = {...fields, id: nextId(d.users), createdAt: new Date().toISOString()};
      d.users.push(user);
      return user;
    });
  },
  // 새 세션을 만들 때 만료된 세션을 함께 정리합니다.
  createSession: async (userId, tokenHash, expiresAt) => {
    if (pg()) {
      await db.session.deleteMany({where: {expiresAt: {lt: new Date()}}});
      return db.session.create({data: {userId, tokenHash, expiresAt}});
    }
    return mutateStore(d => {
      d.sessions = d.sessions.filter(x => new Date(x.expiresAt) > new Date());
      d.sessions.push({userId, tokenHash, expiresAt});
    });
  },
  sessionUser: async tokenHash => {
    if (pg()) {
      const s = await db.session.findUnique({where: {tokenHash}, include: {user: true}});
      return s && s.expiresAt > new Date() ? s.user : null;
    }
    return readStore(d => {
      const s = d.sessions.find(x => x.tokenHash === tokenHash && new Date(x.expiresAt) > new Date());
      return s ? d.users.find(x => x.id === s.userId) : null;
    });
  },
  removeSession: async tokenHash =>
    pg()
      ? db.session.deleteMany({where: {tokenHash}})
      : mutateStore(d => {
          d.sessions = d.sessions.filter(x => x.tokenHash !== tokenHash);
        }),
  // 비밀번호 변경: 현재 세션만 남기고 다른 기기의 로그인은 모두 끊습니다.
  updatePassword: async (userId, password, keepTokenHash) => {
    if (pg())
      return db.$transaction([
        db.user.update({where: {id: userId}, data: {password}}),
        db.session.deleteMany({where: {userId, NOT: {tokenHash: keepTokenHash}}})
      ]);
    return mutateStore(d => {
      d.users.find(x => x.id === userId).password = password;
      d.sessions = d.sessions.filter(x => x.userId !== userId || x.tokenHash === keepTokenHash);
    });
  },
  // 회원 탈퇴: 계정과 세션·후기·찜·최근 기록을 모두 삭제합니다. (DB는 onDelete:Cascade)
  remove: async userId => {
    if (pg()) return db.user.delete({where: {id: userId}});
    return mutateStore(d => {
      d.users = d.users.filter(x => x.id !== userId);
      for (const k of ['sessions', 'reviews', 'favorites', 'recentViews', 'interactions'])
        d[k] = d[k].filter(x => x.userId !== userId);
    });
  }
};
