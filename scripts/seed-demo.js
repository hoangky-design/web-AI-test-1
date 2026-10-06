/* Demo data for testing (clearly marked [DEMO] — delete in the admin before launch):
   - 2 demo courses × 2 demo videos (tiny mp4s generated with ffmpeg into storage/videos)
   - demo admin + demo customer accounts (credentials printed below; change/delete them in production)
   Usage: npm run seed-demo   (idempotent: skips if the demo courses already exist) */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const cfg = require('../server/config');
const { db, logActivity } = require('../server/db');
const L = require('../server/lib');

const DEMO_ADMIN = { email: 'admin.demo@example.com', password: 'AdminDemo#2026', name: '[DEMO] Quản trị viên' };
const DEMO_USER = { email: 'hocvien.demo@example.com', password: 'HocVienDemo#2026', name: '[DEMO] Học viên', phone: '0900000000' };

function makeVideo(label, seconds, hue) {
  const name = crypto.randomBytes(16).toString('hex') + '.mp4';
  const out = path.join(cfg.VIDEO_DIR, name);
  // Test pattern + a sine tone; text is drawn only if this ffmpeg has drawtext (freetype)
  const base = ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=size=640x360:rate=25:duration=${seconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=${440 + hue}:duration=${seconds}`];
  const enc = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '30', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', '-shortest', out];
  try {
    execFileSync('ffmpeg', [...base, '-vf', `drawtext=text='${label}':fontcolor=white:fontsize=36:box=1:boxcolor=black@0.6:x=(w-text_w)/2:y=h-80`, ...enc]);
  } catch {
    execFileSync('ffmpeg', [...base, ...enc]);
  }
  return name;
}

(async () => {
  async function upsertUser(u, role) {
    const hash = await L.hashPassword(u.password);
    const ex = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
    if (ex) { db.prepare('UPDATE users SET password_hash = ?, role = ?, locked = 0 WHERE id = ?').run(hash, role, ex.id); return ex.id; }
    return db.prepare('INSERT INTO users (name, phone, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(u.name, u.phone || '', u.email, hash, role).lastInsertRowid;
  }
  await upsertUser(DEMO_ADMIN, 'admin');
  await upsertUser(DEMO_USER, 'customer');

  if (db.prepare("SELECT 1 FROM courses WHERE title LIKE '[DEMO]%'").get()) {
    console.log('Demo courses already exist — skipped course/video seeding.');
  } else {
    const courses = [
      { title: '[DEMO] Khóa học mẫu 1', price: 10000, thumbnail: 'assets/photos/workshop-drive-03.jpg' },
      { title: '[DEMO] Khóa học mẫu 2', price: 20000, thumbnail: 'assets/photos/workshop-drive-04.jpg' }
    ];
    courses.forEach((c, ci) => {
      const id = db.prepare(`INSERT INTO courses (title, description, price, thumbnail, level, duration, format, published, sort_order)
        VALUES (?, ?, ?, ?, '', '', 'Video online', 1, ?)`)
        .run(c.title, 'Dữ liệu mẫu để thử luồng mua và xem khóa học. Xóa hoặc thay bằng khóa học thật trong trang Quản trị.', c.price, c.thumbnail, ci + 1).lastInsertRowid;
      [1, 2].forEach((vi) => {
        const file = makeVideo(`DEMO ${ci + 1}.${vi}`, 6, ci * 100 + vi * 40);
        db.prepare(`INSERT INTO videos (course_id, title, description, source_type, file_name, mime, sort_order, published)
          VALUES (?, ?, ?, 'file', ?, 'video/mp4', ?, 1)`).run(id, `[DEMO] Video mẫu ${ci + 1}.${vi}`, 'Video mẫu tạo tự động (ảnh test + âm thanh).', file, vi);
      });
    });
    logActivity(null, 'seed_demo', 'Tạo dữ liệu mẫu: 2 khóa học × 2 video');
    console.log('Created 2 demo courses × 2 demo videos.');
  }
  if (!db.prepare("SELECT 1 FROM posts WHERE title LIKE '[DEMO]%'").get()) {
    const md = (n) => `Đây là **bài viết mẫu ${n}** để thử giao diện trang Tin tức.\n\n## Mục ví dụ\n\n- Nội dung viết bằng Markdown\n- Ảnh, liên kết, danh sách\n\n> Xóa hoặc sửa bài này trong Quản trị › Bài viết.`;
    [['[DEMO] Bài viết mẫu 1', 'assets/photos/media-team.jpg', 'Tin công ty'], ['[DEMO] Bài viết mẫu 2', 'assets/photos/growth-solutions.jpg', 'Kiến thức']].forEach(([t, cover, cat], i) => {
      db.prepare(`INSERT INTO posts (title, slug, excerpt, content_md, content_html, cover, category, status, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?)`).run(t, L.slugify(t), 'Bài viết mẫu (dữ liệu thử) — thay bằng tin thật trước khi ra mắt.', md(i + 1), L.renderMarkdown(md(i + 1)), cover, cat,
        new Date(Date.now() - (2 - i) * 3600e3).toISOString());
    });
    console.log('Created 2 demo posts.');
  }
  console.log(`Demo admin:    ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}`);
  console.log(`Demo customer: ${DEMO_USER.email} / ${DEMO_USER.password}`);
})();
