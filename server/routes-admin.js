/* Admin API (quan-tri.html). Every route: requireAdmin (role checked server-side). */
const fs = require('fs');
const path = require('path');
const express = require('express');
const cfg = require('./config');
const { db, getSettings, setSetting, logActivity } = require('./db');
const L = require('./lib');

const r = express.Router();
r.use(L.requireAdmin);
const now = () => new Date().toISOString();
const log = (req, action, detail) => logActivity(req.user.id, action, detail);

/* ---------- Dashboard ---------- */
r.get('/stats', (req, res) => {
  const n = (sql, ...a) => db.prepare(sql).get(...a).n;
  res.json({
    counts: {
      customers: n("SELECT COUNT(*) n FROM users WHERE role = 'customer'"),
      courses: n('SELECT COUNT(*) n FROM courses'),
      courses_published: n('SELECT COUNT(*) n FROM courses WHERE published = 1'),
      videos: n('SELECT COUNT(*) n FROM videos'),
      pending_payments: n("SELECT COUNT(*) n FROM payments WHERE status = 'pending'"),
      posts: n('SELECT COUNT(*) n FROM posts'),
      posts_published: n("SELECT COUNT(*) n FROM posts WHERE status = 'published'"),
      revenue_approved: n("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE status = 'approved'")
    },
    activity: db.prepare(`SELECT a.at, a.action, a.detail, u.name AS actor FROM activity a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 15`).all(),
    bank_configured: L.bankInfo().configured
  });
});

/* ---------- Image uploads (course thumbnails, post covers, images inside posts) ---------- */
r.post('/uploads', L.imageUpload.single('file'), (req, res) => {
  const f = L.acceptUpload(req.file, 'image');
  if (!f) L.fail(400, 'Chưa chọn ảnh.');
  log(req, 'upload', `Tải ảnh ${f.originalname}`);
  res.status(201).json({ url: '/uploads/' + f.filename });
});

/* ---------- Courses ---------- */
function courseInput(b) {
  const c = {
    title: L.str(b.title, 200), description: L.str(b.description, 4000), price: Math.max(0, L.toInt(b.price, 0)),
    thumbnail: L.str(b.thumbnail, 300), level: L.str(b.level, 100), duration: L.str(b.duration, 100), format: L.str(b.format, 100),
    published: L.bool(b.published) ? 1 : 0, sort_order: L.toInt(b.sort_order, 0)
  };
  if (!c.title) L.fail(400, 'Nhập tên khóa học.');
  if (c.thumbnail && !/^(\/uploads\/[a-f0-9]{32}\.[a-z0-9]+|\/?assets\/[\w\-/.]+|https:\/\/\S+)$/.test(c.thumbnail)) L.fail(400, 'Ảnh đại diện không hợp lệ.');
  return c;
}
r.get('/courses', (req, res) => {
  res.json({ courses: db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM videos v WHERE v.course_id = c.id) AS video_count,
    (SELECT COUNT(*) FROM course_access a WHERE a.course_id = c.id AND a.is_open = 1) AS student_count
    FROM courses c ORDER BY c.sort_order, c.id`).all() });
});
r.post('/courses', (req, res) => {
  const c = courseInput(req.body);
  const info = db.prepare(`INSERT INTO courses (title, description, price, thumbnail, level, duration, format, published, sort_order)
    VALUES (@title, @description, @price, @thumbnail, @level, @duration, @format, @published, @sort_order)`).run(c);
  log(req, 'course_create', `Tạo khóa học «${c.title}»`);
  res.status(201).json({ course: db.prepare('SELECT * FROM courses WHERE id = ?').get(info.lastInsertRowid) });
});
r.put('/courses/:id', (req, res) => {
  const id = L.toInt(req.params.id);
  const old = db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
  if (!old) L.fail(404, 'Không tìm thấy khóa học.');
  const c = { ...courseInput(req.body), id, updated_at: now() };
  db.prepare(`UPDATE courses SET title=@title, description=@description, price=@price, thumbnail=@thumbnail, level=@level,
    duration=@duration, format=@format, published=@published, sort_order=@sort_order, updated_at=@updated_at WHERE id=@id`).run(c);
  if (old.thumbnail !== c.thumbnail) L.removeUploadUrl(old.thumbnail);
  log(req, 'course_update', `Sửa khóa học «${c.title}»`);
  res.json({ course: db.prepare('SELECT * FROM courses WHERE id = ?').get(id) });
});
r.delete('/courses/:id', (req, res) => {
  const id = L.toInt(req.params.id);
  const c = db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
  if (!c) L.fail(404, 'Không tìm thấy khóa học.');
  const files = db.prepare("SELECT file_name FROM videos WHERE course_id = ? AND source_type = 'file'").all(id);
  db.prepare('DELETE FROM courses WHERE id = ?').run(id); // cascades videos, payments, access
  files.forEach((f) => f.file_name && fs.rmSync(path.join(cfg.VIDEO_DIR, path.basename(f.file_name)), { force: true }));
  L.removeUploadUrl(c.thumbnail);
  log(req, 'course_delete', `Xóa khóa học «${c.title}»`);
  res.json({ ok: true });
});

/* ---------- Videos inside a course ---------- */
r.get('/courses/:id/videos', (req, res) => {
  res.json({ videos: db.prepare('SELECT * FROM videos WHERE course_id = ? ORDER BY sort_order, id').all(L.toInt(req.params.id)) });
});
function videoFields(req, existing) {
  const b = req.body;
  const v = { title: L.str(b.title, 200), description: L.str(b.description, 2000), published: L.bool(b.published) ? 1 : 0,
              source_type: b.source_type === 'embed' ? 'embed' : 'file' };
  if (!v.title) L.fail(400, 'Nhập tiêu đề video.');
  const file = L.acceptUpload(req.file, 'video');
  if (v.source_type === 'embed') {
    v.embed_url = L.normalizeEmbed(b.embed_url); v.file_name = null; v.mime = null;
    if (file) fs.rmSync(file.path, { force: true });
  } else if (file) {
    v.file_name = file.filename; v.mime = L.VIDEO_TYPES[path.extname(file.filename)] || 'video/mp4'; v.embed_url = null;
  } else if (existing && existing.source_type === 'file' && existing.file_name) {
    v.file_name = existing.file_name; v.mime = existing.mime; v.embed_url = null;
  } else L.fail(400, 'Chọn tệp video để tải lên hoặc dùng link nhúng.');
  return v;
}
function withUploadCleanup(handler) {
  return (req, res) => {
    try { return handler(req, res); } catch (e) { if (req.file) fs.rmSync(req.file.path, { force: true }); throw e; }
  };
}
r.post('/courses/:id/videos', L.videoUpload.single('file'), withUploadCleanup((req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(L.toInt(req.params.id));
  if (!course) L.fail(404, 'Không tìm thấy khóa học.');
  const v = videoFields(req, null);
  v.course_id = course.id;
  v.sort_order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 n FROM videos WHERE course_id = ?').get(course.id).n;
  const info = db.prepare(`INSERT INTO videos (course_id, title, description, source_type, file_name, mime, embed_url, sort_order, published)
    VALUES (@course_id, @title, @description, @source_type, @file_name, @mime, @embed_url, @sort_order, @published)`).run(v);
  log(req, 'video_create', `Thêm video «${v.title}» vào «${course.title}»`);
  res.status(201).json({ video: db.prepare('SELECT * FROM videos WHERE id = ?').get(info.lastInsertRowid) });
}));
r.put('/videos/:id', L.videoUpload.single('file'), withUploadCleanup((req, res) => {
  const old = db.prepare('SELECT * FROM videos WHERE id = ?').get(L.toInt(req.params.id));
  if (!old) L.fail(404, 'Không tìm thấy video.');
  const v = { ...videoFields(req, old), id: old.id };
  db.prepare(`UPDATE videos SET title=@title, description=@description, source_type=@source_type, file_name=@file_name,
    mime=@mime, embed_url=@embed_url, published=@published WHERE id=@id`).run(v);
  if (old.file_name && old.file_name !== v.file_name) fs.rmSync(path.join(cfg.VIDEO_DIR, path.basename(old.file_name)), { force: true });
  log(req, 'video_update', `Sửa video «${v.title}»`);
  res.json({ video: db.prepare('SELECT * FROM videos WHERE id = ?').get(old.id) });
}));
r.delete('/videos/:id', (req, res) => {
  const v = db.prepare('SELECT * FROM videos WHERE id = ?').get(L.toInt(req.params.id));
  if (!v) L.fail(404, 'Không tìm thấy video.');
  db.prepare('DELETE FROM videos WHERE id = ?').run(v.id);
  if (v.file_name) fs.rmSync(path.join(cfg.VIDEO_DIR, path.basename(v.file_name)), { force: true });
  log(req, 'video_delete', `Xóa video «${v.title}»`);
  res.json({ ok: true });
});
// Order: body { ids: [videoId, …] } in the new order
r.post('/courses/:id/videos/order', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map((x) => L.toInt(x)) : [];
  const upd = db.prepare('UPDATE videos SET sort_order = ? WHERE id = ? AND course_id = ?');
  db.transaction(() => ids.forEach((id, i) => upd.run(i + 1, id, L.toInt(req.params.id))))();
  res.json({ ok: true });
});

/* ---------- Payment requests ---------- */
r.get('/payments', (req, res) => {
  const st = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
  res.json({ payments: db.prepare(`SELECT p.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone, c.title AS course_title
    FROM payments p JOIN users u ON u.id = p.user_id JOIN courses c ON c.id = p.course_id
    ${st ? 'WHERE p.status = ?' : ''} ORDER BY p.id DESC LIMIT 300`).all(...(st ? [st] : [])) });
});
function decide(req, status) {
  const p = db.prepare('SELECT p.*, c.title FROM payments p JOIN courses c ON c.id = p.course_id WHERE p.id = ?').get(L.toInt(req.params.id));
  if (!p) L.fail(404, 'Không tìm thấy yêu cầu.');
  if (p.status !== 'pending') L.fail(409, 'Yêu cầu này đã được xử lý.');
  db.transaction(() => {
    db.prepare('UPDATE payments SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?').run(status, now(), req.user.id, p.id);
    if (status === 'approved') {
      db.prepare(`INSERT INTO course_access (user_id, course_id, is_open, expires_at, updated_at, updated_by) VALUES (?, ?, 1, NULL, ?, ?)
        ON CONFLICT(user_id, course_id) DO UPDATE SET is_open = 1, expires_at = NULL, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
        .run(p.user_id, p.course_id, now(), req.user.id);
    }
  })();
  log(req, 'payment_' + status, `${status === 'approved' ? 'Duyệt' : 'Từ chối'} thanh toán ${p.transfer_code} – «${p.title}»`);
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(p.id);
}
r.post('/payments/:id/approve', (req, res) => res.json({ payment: decide(req, 'approved') }));
r.post('/payments/:id/reject', (req, res) => res.json({ payment: decide(req, 'rejected') }));

/* ---------- Customers + per-course access ---------- */
r.get('/users', (req, res) => {
  const q = '%' + L.str(req.query.q, 100) + '%';
  res.json({ users: db.prepare(`SELECT u.id, u.name, u.phone, u.email, u.role, u.locked, u.created_at,
    (SELECT COUNT(*) FROM course_access a WHERE a.user_id = u.id AND a.is_open = 1) AS open_courses,
    (SELECT COUNT(*) FROM payments p WHERE p.user_id = u.id AND p.status = 'pending') AS pending
    FROM users u WHERE u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? ORDER BY u.id DESC LIMIT 500`).all(q, q, q) });
});
r.put('/users/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(L.toInt(req.params.id));
  if (!u) L.fail(404, 'Không tìm thấy tài khoản.');
  if (u.id === req.user.id) L.fail(400, 'Không thể tự khóa tài khoản của chính bạn.');
  const locked = L.bool(req.body.locked) ? 1 : 0;
  db.prepare('UPDATE users SET locked = ? WHERE id = ?').run(locked, u.id);
  if (locked) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id); // log out everywhere
  log(req, locked ? 'user_lock' : 'user_unlock', `${locked ? 'Khóa' : 'Mở khóa'} tài khoản ${u.email}`);
  res.json({ ok: true });
});
r.get('/users/:id/access', (req, res) => {
  const uid = L.toInt(req.params.id);
  res.json({ access: db.prepare(`SELECT c.id AS course_id, c.title, c.price, c.published, a.is_open, a.expires_at, a.updated_at
    FROM courses c LEFT JOIN course_access a ON a.course_id = c.id AND a.user_id = ? ORDER BY c.sort_order, c.id`).all(uid) });
});
r.put('/users/:id/access/:courseId', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(L.toInt(req.params.id));
  const c = db.prepare('SELECT * FROM courses WHERE id = ?').get(L.toInt(req.params.courseId));
  if (!u || !c) L.fail(404, 'Không tìm thấy tài khoản hoặc khóa học.');
  const open = L.bool(req.body.is_open) ? 1 : 0;
  const exp = L.isoOrNull(req.body.expires_at);
  db.prepare(`INSERT INTO course_access (user_id, course_id, is_open, expires_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, course_id) DO UPDATE SET is_open = excluded.is_open, expires_at = excluded.expires_at,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by`).run(u.id, c.id, open, exp, now(), req.user.id);
  log(req, open ? 'access_open' : 'access_close', `${open ? 'Mở' : 'Đóng'} khóa «${c.title}» cho ${u.email}${exp ? ' (hết hạn ' + exp.slice(0, 10) + ')' : ''}`);
  res.json({ ok: true });
});

/* ---------- Posts ---------- */
function postInput(b, id) {
  const p = {
    title: L.str(b.title, 200), excerpt: L.str(b.excerpt, 600), content_md: String(b.content_md || '').slice(0, 200000),
    cover: L.str(b.cover, 300), category: L.str(b.category, 80), status: b.status === 'published' ? 'published' : 'draft'
  };
  if (!p.title) L.fail(400, 'Nhập tiêu đề bài viết.');
  if (p.cover && !/^(\/uploads\/[a-f0-9]{32}\.[a-z0-9]+|\/?assets\/[\w\-/.]+|https:\/\/\S+)$/.test(p.cover)) L.fail(400, 'Ảnh bìa không hợp lệ.');
  let slug = L.slugify(L.str(b.slug, 120) || p.title);
  const base = slug; let i = 2;
  while (db.prepare('SELECT 1 FROM posts WHERE slug = ? AND id <> ?').get(slug, id || 0)) slug = `${base}-${i++}`;
  p.slug = slug;
  p.content_html = L.renderMarkdown(p.content_md);
  p.published_at = L.isoOrNull(b.published_at);
  if (p.status === 'published' && !p.published_at) p.published_at = now();
  return p;
}
r.get('/posts', (req, res) => {
  res.json({ posts: db.prepare('SELECT id, title, slug, category, status, published_at, updated_at, cover FROM posts ORDER BY COALESCE(published_at, created_at) DESC, id DESC').all() });
});
r.get('/posts/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(L.toInt(req.params.id));
  if (!p) L.fail(404, 'Không tìm thấy bài viết.');
  res.json({ post: p });
});
r.post('/posts/preview', (req, res) => res.json({ html: L.renderMarkdown(String(req.body.content_md || '').slice(0, 200000)) }));
r.post('/posts', (req, res) => {
  const p = { ...postInput(req.body, 0), author_id: req.user.id };
  const info = db.prepare(`INSERT INTO posts (title, slug, excerpt, content_md, content_html, cover, category, status, published_at, author_id)
    VALUES (@title, @slug, @excerpt, @content_md, @content_html, @cover, @category, @status, @published_at, @author_id)`).run(p);
  log(req, 'post_create', `Tạo bài viết «${p.title}» (${p.status === 'published' ? 'đăng' : 'nháp'})`);
  res.status(201).json({ post: db.prepare('SELECT * FROM posts WHERE id = ?').get(info.lastInsertRowid) });
});
r.put('/posts/:id', (req, res) => {
  const id = L.toInt(req.params.id);
  const old = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  if (!old) L.fail(404, 'Không tìm thấy bài viết.');
  const p = { ...postInput(req.body, id), id, updated_at: now() };
  db.prepare(`UPDATE posts SET title=@title, slug=@slug, excerpt=@excerpt, content_md=@content_md, content_html=@content_html,
    cover=@cover, category=@category, status=@status, published_at=@published_at, updated_at=@updated_at WHERE id=@id`).run(p);
  if (old.cover !== p.cover) L.removeUploadUrl(old.cover);
  log(req, 'post_update', `Sửa bài viết «${p.title}»`);
  res.json({ post: db.prepare('SELECT * FROM posts WHERE id = ?').get(id) });
});
r.delete('/posts/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(L.toInt(req.params.id));
  if (!p) L.fail(404, 'Không tìm thấy bài viết.');
  db.prepare('DELETE FROM posts WHERE id = ?').run(p.id);
  L.removeUploadUrl(p.cover);
  log(req, 'post_delete', `Xóa bài viết «${p.title}»`);
  res.json({ ok: true });
});

/* ---------- Settings: bank info + admin password ---------- */
r.get('/settings', (req, res) => {
  const s = getSettings();
  res.json({ bank: { bank_name: s.bank_name || '', bank_id: s.bank_id || '', account_no: s.account_no || '', account_name: s.account_name || '', qr_template: s.qr_template || 'compact2' } });
});
r.put('/settings', (req, res) => {
  const b = req.body || {};
  const bank = {
    bank_name: L.str(b.bank_name, 120), bank_id: L.str(b.bank_id, 20).replace(/\s/g, ''),
    account_no: L.str(b.account_no, 40).replace(/\s/g, ''), account_name: L.str(b.account_name, 120).toUpperCase(),
    qr_template: ['compact2', 'compact', 'qr_only', 'print'].includes(b.qr_template) ? b.qr_template : 'compact2'
  };
  if (bank.bank_id && !/^[A-Za-z0-9]{2,20}$/.test(bank.bank_id)) L.fail(400, 'Mã ngân hàng (VietQR) chỉ gồm chữ và số, ví dụ VCB hoặc 970436.');
  if (bank.account_no && !/^[0-9A-Za-z]{4,30}$/.test(bank.account_no)) L.fail(400, 'Số tài khoản không hợp lệ.');
  Object.entries(bank).forEach(([k, v]) => setSetting(k, v));
  log(req, 'settings_bank', 'Cập nhật thông tin chuyển khoản');
  res.json({ ok: true, configured: L.bankInfo().configured });
});
r.post('/password', async (req, res) => {
  const cur = String(req.body.current || ''), next = String(req.body.next || '');
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!(await L.checkPassword(cur, u.password_hash))) L.fail(400, 'Mật khẩu hiện tại không đúng.');
  if (next.length < 10) L.fail(400, 'Mật khẩu mới cần ít nhất 10 ký tự.');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await L.hashPassword(next), u.id);
  const sid = req.cookies[L.COOKIE];
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(u.id, sid); // other devices logged out
  log(req, 'password_change', 'Đổi mật khẩu quản trị');
  res.json({ ok: true });
});

module.exports = r;
