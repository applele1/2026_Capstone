const path = require('path');

function apiNotFound(req, res) {
  res.status(404).json({ error: '존재하지 않는 API예요.' });
}

function notFoundPage(req, res) {
  res.status(404).sendFile(path.join(__dirname, '../views/404.html'));
}

function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? '서버 오류가 발생했어요.' : err.message });
}

module.exports = { apiNotFound, notFoundPage, errorHandler };
