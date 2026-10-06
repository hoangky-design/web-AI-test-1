/* Hinton Media — Node server: serves public/ (the static site) + the course/admin API.
   Run: npm start (see README.md). */
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const cfg = require('./config');
const { db, logActivity } = require('./db');
const L = require('./lib');

const app = express();
app.disable('x-powered-by');
if (cfg.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(cfg.TRUST_PROXY) ? +cfg.TRUST_PROXY : cfg.TRUST_PROXY);

// Baseline security headers (no CSP yet: the static pages use small inline <script>s in <head>)
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
            'X-Frame-Options': 'SAMEORIGIN', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
  if (cfg.COOKIE_SECURE) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(L.loadUser);

/* ---------- Server-side page guards (customer library + admin) ---------- */
const loginRedirect = (req, res) => res.redirect(302, '/dang-nhap.html?next=' + encodeURIComponent(req.originalUrl));
app.get(['/bai-hoc-cua-toi', '/bai-hoc-cua-toi.html'], (req, res, next) => {
  if (!req.user) return loginRedirect(req, res);
  res.set('Cache-Control', 'private, no-store'); next();
});
app.get(['/quan-tri', '/quan-tri.html'], (req, res, next) => {
  if (!req.user) return loginRedirect(req, res);
  if (req.user.role !== 'admin') return res.redirect(302, '/bai-hoc-cua-toi.html');
  res.set('Cache-Control', 'private, no-store'); next();
});

/* ---------- API ---------- */
app.use('/api', L.csrfGuard, (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
app.use('/api', require('./routes-public'));
app.use('/api/admin', require('./routes-admin'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Không tìm thấy.' }));

/* ---------- Uploaded images (storage/uploads, outside public/) ---------- */
app.use('/uploads', (req, res, next) => (L.IMAGE_TYPES[path.extname(req.path).toLowerCase()] ? next() : res.status(404).end()));
app.use('/uploads', express.static(cfg.UPLOAD_DIR, {
  index: false, dotfiles: 'deny', maxAge: '30d', fallthrough: false,
  setHeaders: (res) => res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'")
}));

/* ---------- Static site ---------- */
app.use(express.static(cfg.PUBLIC_DIR, { extensions: ['html'], index: 'index.html', maxAge: '1h' }));
app.use((req, res) => res.status(404).sendFile(path.join(cfg.PUBLIC_DIR, '404.html')));

/* ---------- Errors ---------- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.status || 500, message = err.message;
  if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Tệp quá lớn.' : 'Tải tệp không thành công.';
  } else if (err.type === 'entity.too.large') { status = 413; message = 'Dữ liệu quá lớn.'; }
  else if (err.type === 'entity.parse.failed') { status = 400; message = 'Dữ liệu không hợp lệ.'; }
  if (status >= 500) { console.error(err); message = 'Lỗi máy chủ. Vui lòng thử lại.'; }
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: message });
  res.status(status).send(message);
});

/* ---------- First run: seed an admin from ADMIN_EMAIL / ADMIN_PASSWORD if none exists ---------- */
(async () => {
  const hasAdmin = db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get();
  if (!hasAdmin && cfg.ADMIN_EMAIL && cfg.ADMIN_PASSWORD) {
    const hash = await L.hashPassword(cfg.ADMIN_PASSWORD);
    db.prepare("INSERT INTO users (name, phone, email, password_hash, role) VALUES (?, '', ?, ?, 'admin') ON CONFLICT(email) DO UPDATE SET role = 'admin'")
      .run(cfg.ADMIN_NAME, cfg.ADMIN_EMAIL.toLowerCase(), hash);
    logActivity(null, 'admin_seed', `Tạo tài khoản quản trị ${cfg.ADMIN_EMAIL}`);
    console.log(`[setup] Admin account created: ${cfg.ADMIN_EMAIL}`);
  } else if (!hasAdmin) {
    console.log('[setup] No admin yet. Run: npm run create-admin -- --email you@example.com --password "…"');
  }
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  app.listen(cfg.PORT, cfg.HOST, () => console.log(`Hinton Media server: http://localhost:${cfg.PORT}`));
})();

module.exports = app;
