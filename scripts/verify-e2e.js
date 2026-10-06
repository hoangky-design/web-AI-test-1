/* End-to-end API check against a RUNNING server (npm start first).
   BASE_URL (default http://localhost:8080), ADMIN_EMAIL / ADMIN_PASSWORD (default: demo admin from seed-demo).
   Flow: register → locked course → payment request → admin approves → stream (Range 206) →
   admin closes access (403) → expiry → admin lock account; plus role/CSRF/XSS/upload checks.
   Creates a "[TEST]" customer each run; test posts/videos it creates are deleted again.
   Usage: npm run verify */
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:8080';
const ADMIN = { email: process.env.VERIFY_ADMIN_EMAIL || 'admin.demo@example.com', password: process.env.VERIFY_ADMIN_PASSWORD || 'AdminDemo#2026' };

let pass = 0, failN = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓ ' + label); } else { failN++; console.log('  ✗ ' + label + (extra ? ' — ' + extra : '')); }
}
function client() {
  let cookie = '';
  return async function call(method, url, body, headers = {}) {
    const h = { 'X-HM-Request': '1', ...headers };
    if (cookie) h.Cookie = cookie;
    let b = body;
    if (body && !(body instanceof FormData)) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    const res = await fetch(BASE + url, { method, headers: h, body: b, redirect: 'manual' });
    const sc = res.headers.get('set-cookie');
    if (sc && sc.startsWith('hm_sid=')) cookie = sc.split(';')[0].includes('hm_sid=;') ? '' : sc.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  };
}

(async () => {
  const user = client(), admin = client(), anon = client();
  const email = `verify.${Date.now()}@example.com`;
  console.log('Server: ' + BASE);

  console.log('\n1. Đăng ký + đăng nhập');
  let r = await user('POST', '/api/auth/register', { name: '[TEST] Kiểm thử', phone: '0900000001', email, password: 'Matkhau123' });
  ok(r.status === 201, 'register 201', r.status);
  const setCookie = r.headers.get('set-cookie') || '';
  ok(/HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie), 'session cookie HttpOnly + SameSite=Lax');
  r = await user('GET', '/api/me'); ok(r.data.user && r.data.user.email === email, '/api/me returns the user');
  const uid = r.data.user.id;
  r = await anon('POST', '/api/auth/login', { email, password: 'sai-mat-khau' }); ok(r.status === 401, 'wrong password → 401');
  r = await anon('GET', '/bai-hoc-cua-toi.html'); ok(r.status === 302 && /dang-nhap\.html\?next=/.test(r.headers.get('location')), 'library page without login → 302 to login');

  console.log('\n2. Khóa học bị khóa');
  r = await user('GET', '/api/my/courses');
  const course = r.data.courses.find((c) => c.title.startsWith('[DEMO]')) || r.data.courses[0];
  ok(course && course.access.open === false, 'demo course is locked for a new user');
  ok(course.videos.length >= 1 && course.videos.every((v) => !('source_type' in v)), 'locked course lists titles only (no sources)');
  const vid = course.videos[0].id;
  r = await user('GET', `/api/videos/${vid}/stream`); ok(r.status === 403, 'stream locked video → 403', r.status);
  r = await user('GET', `/api/videos/${vid}/play`); ok(r.status === 403, 'play info locked video → 403');
  r = await anon('GET', `/api/videos/${vid}/stream`); ok(r.status === 401, 'stream without login → 401');

  console.log('\n3. Thanh toán chuyển khoản');
  r = await user('GET', `/api/my/courses/${course.id}/payment`);
  const code = `HM${uid}K${course.id}`;
  ok(r.data.transfer_code === code, 'transfer code = ' + code);
  ok(r.data.amount === course.price, 'amount = course price (' + course.price + ')');
  ok(r.data.bank && 'configured' in r.data.bank, 'bank info returned (configured=' + r.data.bank.configured + ', qr_url=' + (r.data.qr_url ? 'yes' : 'null') + ')');
  r = await user('POST', `/api/my/courses/${course.id}/payments`); ok(r.status === 201 && r.data.payment.status === 'pending', 'payment request → pending');
  r = await user('POST', `/api/my/courses/${course.id}/payments`); ok(r.data.duplicate === true, 'second request does not duplicate');
  r = await user('POST', `/api/my/courses/${course.id}/payments`, null, { 'X-HM-Request': '' }); ok(r.status === 403, 'write without X-HM-Request (CSRF guard) → 403');

  console.log('\n4. Quyền quản trị');
  r = await user('GET', '/api/admin/stats'); ok(r.status === 403, 'customer → /api/admin/* 403');
  r = await anon('GET', '/api/admin/stats'); ok(r.status === 401, 'anonymous → /api/admin/* 401');
  r = await user('GET', '/quan-tri.html'); ok(r.status === 302, 'customer opening quan-tri.html → redirected');
  r = await admin('POST', '/api/auth/login', ADMIN); ok(r.status === 200 && r.data.user.role === 'admin', 'admin login');
  r = await admin('GET', '/api/admin/stats'); ok(r.status === 200 && r.data.counts.pending_payments >= 1, 'dashboard stats (pending ≥ 1)');
  r = await admin('GET', '/api/admin/payments?status=pending');
  const pay = r.data.payments.find((p) => p.transfer_code === code); ok(!!pay, 'pending list contains ' + code);
  r = await admin('POST', `/api/admin/payments/${pay.id}/approve`); ok(r.status === 200 && r.data.payment.status === 'approved', 'admin approves');

  console.log('\n5. Xem video sau khi duyệt');
  r = await user('GET', '/api/my/courses'); const c2 = r.data.courses.find((c) => c.id === course.id);
  ok(c2.access.open === true && c2.videos[0].source_type, 'course unlocked, sources visible');
  r = await user('GET', `/api/videos/${vid}/play`); ok(r.status === 200 && r.data.src === `/api/videos/${vid}/stream`, 'play info → stream URL');
  r = await user('GET', `/api/videos/${vid}/stream`, null, { Range: 'bytes=0-1023' });
  ok(r.status === 206, 'Range request → 206', r.status);
  ok(/^bytes 0-1023\/\d+$/.test(r.headers.get('content-range') || ''), 'Content-Range ' + r.headers.get('content-range'));
  ok(r.data.length === 1024, 'body = 1024 bytes');
  ok(r.headers.get('accept-ranges') === 'bytes', 'Accept-Ranges: bytes');
  r = await user('GET', `/api/videos/${vid}/stream`, null, { Range: 'bytes=999999999-' }); ok(r.status === 416, 'out-of-range → 416');
  r = await anon('GET', '/storage/videos/'); ok(r.status === 404, 'storage/ not publicly served');

  console.log('\n6. Đóng / hết hạn / khóa tài khoản');
  r = await admin('PUT', `/api/admin/users/${uid}/access/${course.id}`, { is_open: false }); ok(r.status === 200, 'admin closes access');
  r = await user('GET', `/api/videos/${vid}/stream`, null, { Range: 'bytes=0-1' }); ok(r.status === 403, 'after close → 403', r.status);
  r = await admin('PUT', `/api/admin/users/${uid}/access/${course.id}`, { is_open: true, expires_at: '2020-01-01' });
  r = await user('GET', `/api/videos/${vid}/stream`, null, { Range: 'bytes=0-1' }); ok(r.status === 403, 'expired access → 403');
  r = await admin('PUT', `/api/admin/users/${uid}/access/${course.id}`, { is_open: true, expires_at: '2099-12-31' });
  r = await user('GET', `/api/videos/${vid}/stream`, null, { Range: 'bytes=0-1' }); ok(r.status === 206, 'reopened with future expiry → 206');
  r = await admin('PUT', `/api/admin/users/${uid}`, { locked: true });
  r = await user('GET', '/api/me'); ok(r.data.user === null, 'locked account: session revoked');
  r = await anon('POST', '/api/auth/login', { email, password: 'Matkhau123' }); ok(r.status === 403, 'locked account cannot log in');
  await admin('PUT', `/api/admin/users/${uid}`, { locked: false });

  console.log('\n7. Bài viết (XSS lọc ở máy chủ) + ảnh');
  r = await admin('POST', '/api/admin/posts', { title: '[TEST] Bài kiểm thử', status: 'published',
    content_md: 'Xin chào <script>alert(1)</script> <img src=x onerror="alert(2)"> [x](javascript:alert(3)) **ok**' });
  const post = r.data.post; ok(r.status === 201, 'create post');
  r = await anon('GET', '/api/posts/' + post.slug);
  const html = r.data.post && r.data.post.content_html || '';
  ok(r.status === 200 && !/<script|onerror|javascript:/i.test(html) && /<strong>ok<\/strong>/.test(html), 'public HTML sanitized');
  r = await admin('POST', '/api/admin/posts', { title: '[TEST] Nháp', status: 'draft', content_md: 'x' }); const draft = r.data.post;
  r = await anon('GET', '/api/posts/' + draft.slug); ok(r.status === 404, 'draft not public');
  r = await anon('GET', '/api/posts?per=3'); ok(r.status === 200 && Array.isArray(r.data.posts), 'post list (paginated) ok, total=' + r.data.total);
  await admin('DELETE', '/api/admin/posts/' + post.id); await admin('DELETE', '/api/admin/posts/' + draft.id);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
  let fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'a.png');
  r = await admin('POST', '/api/admin/uploads', fd); ok(r.status === 201 && /^\/uploads\/[a-f0-9]{32}\.png$/.test(r.data.url), 'image upload ok');
  const img = await anon('GET', r.data.url); ok(img.status === 200, 'uploaded image served');
  fs.rmSync(path.join(__dirname, '..', 'storage', 'uploads', path.basename(r.data.url)), { force: true }); // clean up the test file
  fd = new FormData(); fd.append('file', new Blob(['<svg onload=alert(1)>'], { type: 'image/png' }), 'evil.png');
  r = await admin('POST', '/api/admin/uploads', fd); ok(r.status === 400, 'fake image rejected (magic bytes)');
  fd = new FormData(); fd.append('file', new Blob(['x'], { type: 'image/svg+xml' }), 'x.svg');
  r = await admin('POST', '/api/admin/uploads', fd); ok(r.status === 400, 'SVG rejected');

  console.log('\n8. Video: tải lên + link nhúng');
  const sample = fs.readdirSync(path.join(__dirname, '..', 'storage', 'videos')).find((f) => f.endsWith('.mp4'));
  fd = new FormData(); fd.append('title', '[TEST] Upload'); fd.append('source_type', 'file'); fd.append('published', '1');
  fd.append('file', new Blob([fs.readFileSync(path.join(__dirname, '..', 'storage', 'videos', sample))], { type: 'video/mp4' }), 'test.mp4');
  r = await admin('POST', `/api/admin/courses/${course.id}/videos`, fd); ok(r.status === 201 && r.data.video.file_name, 'video upload ok');
  if (r.data.video) await admin('DELETE', '/api/admin/videos/' + r.data.video.id);
  fd = new FormData(); fd.append('title', '[TEST] Embed'); fd.append('source_type', 'embed'); fd.append('embed_url', 'https://youtu.be/abcdefghijk'); fd.append('published', '1');
  r = await admin('POST', `/api/admin/courses/${course.id}/videos`, fd);
  ok(r.status === 201 && r.data.video.embed_url === 'https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0&modestbranding=1', 'embed URL normalized to youtube-nocookie');
  if (r.data.video) await admin('DELETE', '/api/admin/videos/' + r.data.video.id);
  fd = new FormData(); fd.append('title', '[TEST] Bad'); fd.append('source_type', 'embed'); fd.append('embed_url', 'javascript:alert(1)');
  r = await admin('POST', `/api/admin/courses/${course.id}/videos`, fd); ok(r.status === 400, 'non-https embed rejected');

  console.log(`\n${pass} passed, ${failN} failed`);
  process.exit(failN ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
