/* Public + customer API: auth, course catalogue, library, payments, streaming, posts. */
const fs = require('fs');
const path = require('path');
const express = require('express');
const cfg = require('./config');
const { db, logActivity } = require('./db');
const L = require('./lib');

const r = express.Router();
const now = () => new Date().toISOString();

/* ---------- Auth ---------- */
r.get('/me', (req, res) => res.json({ user: L.publicUser(req.user) })); // always 200 (null when logged out)

r.post('/auth/register', async (req, res) => {
  const name = L.str(req.body.name, 120), phone = L.str(req.body.phone, 30);
  const email = L.str(req.body.email, 200).toLowerCase(), password = String(req.body.password || '');
  const errors = {};
  if (!name) errors.name = 'Nhập họ tên của bạn.';
  if (!L.isPhone(phone)) errors.phone = 'Nhập số điện thoại hợp lệ: 9–12 chữ số, có thể bắt đầu bằng +84.';
  if (!L.isEmail(email)) errors.email = 'Nhập email hợp lệ, ví dụ ten@congty.vn.';
  if (password.length < 8 || password.length > 200) errors.password = 'Mật khẩu cần ít nhất 8 ký tự.';
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Vui lòng kiểm tra lại thông tin.', errors });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'Email này đã có tài khoản.', errors: { email: 'Email này đã có tài khoản. Hãy đăng nhập.' } });
  }
  const hash = await L.hashPassword(password);
  const info = db.prepare('INSERT INTO users (name, phone, email, password_hash) VALUES (?, ?, ?, ?)').run(name, phone, email, hash);
  logActivity(info.lastInsertRowid, 'register', `${name} (${email}) tạo tài khoản`);
  L.createSession(res, info.lastInsertRowid);
  res.status(201).json({ user: L.publicUser({ id: info.lastInsertRowid, name, phone, email, role: 'customer' }) });
});

r.post('/auth/login', async (req, res) => {
  const email = L.str(req.body.email, 200).toLowerCase(), password = String(req.body.password || '');
  const key = L.throttleKey(req, email);
  if (L.isThrottled(key)) return res.status(429).json({ error: 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.' });
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = u ? await L.checkPassword(password, u.password_hash) : (await L.checkPassword(password, L.DUMMY_HASH), false);
  if (!u || !ok) { L.noteFailure(key); return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' }); }
  if (u.locked) return res.status(403).json({ error: 'Tài khoản đã bị khóa. Vui lòng liên hệ hotline.' });
  L.clearFailures(key);
  L.createSession(res, u.id);
  res.json({ user: L.publicUser(u) });
});

r.post('/auth/logout', (req, res) => { L.destroySession(req, res); res.json({ ok: true }); });

/* ---------- Public catalogue (khoa-hoc.html) ---------- */
const courseCols = `c.id, c.title, c.description, c.price, c.thumbnail, c.level, c.duration, c.format,
  (SELECT COUNT(*) FROM videos v WHERE v.course_id = c.id AND v.published = 1) AS video_count`;
r.get('/courses', (req, res) => {
  res.json({ courses: db.prepare(`SELECT ${courseCols} FROM courses c WHERE c.published = 1 ORDER BY c.sort_order, c.id`).all() });
});

/* ---------- Library (bai-hoc-cua-toi.html) ---------- */
r.get('/my/courses', L.requireUser, (req, res) => {
  const courses = db.prepare(`SELECT ${courseCols} FROM courses c WHERE c.published = 1 ORDER BY c.sort_order, c.id`).all();
  const vids = db.prepare('SELECT id, title, description, source_type FROM videos WHERE course_id = ? AND published = 1 ORDER BY sort_order, id');
  const pend = db.prepare(`SELECT id, status, created_at FROM payments WHERE user_id = ? AND course_id = ? ORDER BY id DESC LIMIT 1`);
  res.json({
    courses: courses.map((c) => {
      const a = req.user.role === 'admin' ? null : L.accessFor(req.user.id, c.id);
      const open = L.hasCourseAccess(req.user, c.id);
      const last = pend.get(req.user.id, c.id);
      return {
        ...c,
        access: { open, expires_at: a ? a.expires_at : null, closed_by_admin: !!(a && !a.is_open), expired: !!(a && a.is_open && a.expires_at && new Date(a.expires_at) <= new Date()) },
        last_payment: last || null,
        transfer_code: L.transferCode(req.user.id, c.id),
        // Locked courses list titles only; sources come from /videos/:id/play after an access check
        videos: vids.all(c.id).map((v) => (open ? v : { id: v.id, title: v.title }))
      };
    })
  });
});

function publishedCourse(id) {
  const c = db.prepare('SELECT * FROM courses WHERE id = ? AND published = 1').get(id);
  if (!c) L.fail(404, 'Không tìm thấy khóa học.');
  return c;
}

r.get('/my/courses/:id/payment', L.requireUser, (req, res) => {
  const c = publishedCourse(L.toInt(req.params.id));
  const bank = L.bankInfo();
  const code = L.transferCode(req.user.id, c.id);
  res.json({
    course: { id: c.id, title: c.title, price: c.price }, amount: c.price, transfer_code: code,
    bank: { bank_name: bank.bank_name, account_no: bank.account_no, account_name: bank.account_name, configured: bank.configured },
    qr_url: L.vietQrUrl(bank, c.price, code)
  });
});

r.post('/my/courses/:id/payments', L.requireUser, (req, res) => {
  const c = publishedCourse(L.toInt(req.params.id));
  if (L.hasCourseAccess(req.user, c.id)) return res.status(409).json({ error: 'Bạn đã có quyền xem khóa học này.' });
  const existing = db.prepare("SELECT * FROM payments WHERE user_id = ? AND course_id = ? AND status = 'pending'").get(req.user.id, c.id);
  if (existing) return res.json({ payment: existing, duplicate: true });
  const code = L.transferCode(req.user.id, c.id);
  const info = db.prepare('INSERT INTO payments (user_id, course_id, amount, transfer_code) VALUES (?, ?, ?, ?)').run(req.user.id, c.id, c.price, code);
  logActivity(req.user.id, 'payment_request', `${req.user.name} báo đã chuyển khoản khóa «${c.title}» (${code})`);
  res.status(201).json({ payment: db.prepare('SELECT * FROM payments WHERE id = ?').get(info.lastInsertRowid) });
});

/* ---------- Video playback (access checked on every request) ---------- */
function videoWithAccess(req) {
  const v = db.prepare(`SELECT v.*, c.published AS course_published FROM videos v JOIN courses c ON c.id = v.course_id WHERE v.id = ?`).get(L.toInt(req.params.id));
  if (!v || ((!v.published || !v.course_published) && req.user.role !== 'admin')) L.fail(404, 'Không tìm thấy video.');
  if (!L.hasCourseAccess(req.user, v.course_id)) L.fail(403, 'Bạn chưa có quyền xem video này.');
  return v;
}
r.get('/videos/:id/play', L.requireUser, (req, res) => {
  const v = videoWithAccess(req);
  res.set('Cache-Control', 'private, no-store');
  res.json(v.source_type === 'embed' ? { type: 'embed', src: v.embed_url, title: v.title } : { type: 'file', src: `/api/videos/${v.id}/stream`, mime: v.mime, title: v.title });
});

// HTTP Range streaming (206) from storage/videos, outside the public folder
r.get('/videos/:id/stream', L.requireUser, (req, res) => {
  const v = videoWithAccess(req);
  if (v.source_type !== 'file' || !v.file_name) L.fail(404, 'Video không có tệp.');
  const file = path.join(cfg.VIDEO_DIR, path.basename(v.file_name));
  let stat; try { stat = fs.statSync(file); } catch { L.fail(404, 'Không tìm thấy tệp video.'); }
  const size = stat.size;
  res.set({ 'Accept-Ranges': 'bytes', 'Content-Type': v.mime || 'video/mp4', 'Cache-Control': 'private, no-store',
            'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' });
  const range = req.headers.range;
  if (!range) { res.set('Content-Length', size); if (req.method === 'HEAD') return res.end(); return fs.createReadStream(file).pipe(res); }
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  let start, end;
  if (m && m[1] !== '') { start = +m[1]; end = m[2] !== '' ? Math.min(+m[2], size - 1) : size - 1; }
  else if (m && m[2] !== '') { start = Math.max(size - +m[2], 0); end = size - 1; } // suffix range: last N bytes
  if (start == null || start > end || start >= size) { res.set('Content-Range', `bytes */${size}`); return res.status(416).end(); }
  res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file, { start, end }).pipe(res);
});

/* ---------- Posts (tin-tuc.html, bai-viet.html, hoat-dong.html latest) ---------- */
const postCols = 'id, title, slug, excerpt, cover, category, published_at';
const livePost = `status = 'published' AND published_at IS NOT NULL AND published_at <= ?`;
r.get('/posts', (req, res) => {
  const per = Math.min(Math.max(L.toInt(req.query.per, 9), 1), 30);
  const page = Math.max(L.toInt(req.query.page, 1), 1);
  const cat = L.str(req.query.category, 80);
  const where = livePost + (cat ? ' AND category = ?' : '');
  const args = cat ? [now(), cat] : [now()];
  const total = db.prepare(`SELECT COUNT(*) n FROM posts WHERE ${where}`).get(...args).n;
  const posts = db.prepare(`SELECT ${postCols} FROM posts WHERE ${where} ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  const categories = db.prepare(`SELECT category, COUNT(*) n FROM posts WHERE ${livePost} AND category <> '' GROUP BY category ORDER BY category`).all(now());
  res.json({ posts, page, per, total, pages: Math.max(1, Math.ceil(total / per)), categories });
});
r.get('/posts/:slug', (req, res) => {
  const p = db.prepare(`SELECT ${postCols}, content_html, updated_at FROM posts WHERE slug = ? AND ${livePost}`).get(L.str(req.params.slug, 120), now());
  if (!p) return res.status(404).json({ error: 'Không tìm thấy bài viết.' });
  res.json({ post: p });
});

module.exports = r;
