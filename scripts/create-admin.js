/* Create (or promote / reset password of) an admin account.
   npm run create-admin -- --email admin@example.com --password "mật-khẩu-dài" [--name "Tên"] */
const { db, logActivity } = require('../server/db');
const L = require('../server/lib');

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
(async () => {
  const email = String(get('email') || '').trim().toLowerCase();
  const password = String(get('password') || '');
  const name = get('name') || 'Quản trị viên';
  if (!L.isEmail(email) || password.length < 10) {
    console.error('Cách dùng: npm run create-admin -- --email admin@example.com --password "ít nhất 10 ký tự" [--name "Tên"]');
    process.exit(1);
  }
  const hash = await L.hashPassword(password);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) db.prepare("UPDATE users SET role = 'admin', password_hash = ?, locked = 0 WHERE id = ?").run(hash, existing.id);
  else db.prepare("INSERT INTO users (name, phone, email, password_hash, role) VALUES (?, '', ?, ?, 'admin')").run(name, email, hash);
  logActivity(null, 'admin_seed', `Tạo/cập nhật quản trị ${email} (script)`);
  console.log(`OK: ${email} là quản trị viên.`);
})();
