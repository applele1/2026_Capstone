require('dotenv').config();
const path = require('path');
const express = require('express');
const { store } = require('./src/models/store');
const { PORT } = require('./src/config');
const routes = require('./src/routes');
const { apiNotFound, notFoundPage, errorHandler } = require('./src/middleware/errors');

const app = express();
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'src/views')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(routes);
app.use('/api', apiNotFound);
app.use(notFoundPage);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`밥잇 서버 실행 중: http://localhost:${PORT} (데이터: ${store.mode})`);
});
