import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {api} from './routes/api.js';
import {Restaurant} from './models/Restaurant.js';
import {emojiOf} from './services/recommendation.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const app = express();
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          'http://t1.daumcdn.net',
          'https://dapi.kakao.com',
          'https://*.daumcdn.net',
          'https://*.kakao.com',
          'http://*.kakaocdn.net',
          'https://*.kakaocdn.net'
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          'data:',
          'http://*.daumcdn.net',
          'https://*.daumcdn.net',
          'http://*.daum.net',
          'https://*.daum.net',
          'https://*.kakao.com',
          'http://*.kakaocdn.net',
          'https://*.kakaocdn.net'
        ],
        connectSrc: [
          "'self'",
          'https://*.kakao.com',
          'https://*.daumcdn.net',
          'http://*.kakaocdn.net',
          'https://*.kakaocdn.net'
        ],
        upgradeInsecureRequests: null
      }
    },
    crossOriginResourcePolicy: {policy: 'cross-origin'}
  })
);
app.use(express.json({limit: '16kb'}));
app.set('view engine', 'ejs');
app.set('views', path.join(root, 'src/views'));
app.use(express.static(path.join(root, 'public')));
app.use('/api', api);
app.get('/', async (req, res) =>
  res.render('index', {
    categories: (await Restaurant.categories()).map(c => ({id: c.id, name: c.name, emoji: emojiOf(c.name)}))
  })
);
app.get('/privacy', (req, res) => res.render('privacy'));
app.use((req, res) => res.status(404).json({message: '페이지를 찾을 수 없습니다.'}));
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'P2002' ? 409 : 500);
  if (status >= 500) console.error(err.message);
  res.status(status).json({
    message:
      status >= 500
        ? '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
        : err.code === 'P2002'
          ? '이미 등록된 정보입니다.'
          : err.message
  });
});
