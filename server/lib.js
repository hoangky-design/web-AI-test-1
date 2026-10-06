/* Shared helpers: sessions/auth middleware, validation, VietQR, uploads, Markdown. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');
const cfg = require('./config');
const { db, getSettings } = require('./db');

const COOKIE = 'hm_sid';
const BCRYPT_ROUNDS = 12;

/* ---------- Errors ---------- */
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };

/* ---------- Passwords + sessions ---------- */
const hashPassword = (pw) => bcrypt.hash(pw, BCRYPT_ROUNDS);
const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);
// Compared against when the email does not exist, so response time does not reveal registered emails
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_ROUNDS);

function createSession(res, userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + cfg.SESSION_DAYS * 864e5);
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, expires.toISOString());
  res.cookie(COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: cfg.COOKIE_SECURE, expires, path: '/' });
}
function destroySession(req, res) {
  const id = req.cookies && req.cookies[COOKIE];
  if (id) db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: cfg.COOKIE_SECURE, path: '/' });
}
// Attach req.user (or null) from the session cookie. Locked accounts are treated as logged out.
function loadUser(req, res, next) {
  req.user = null;
  const id = req.cookies && req.cookies[COOKIE];
  if (id) {
    const row = db.prepare(`SELECT u.id, u.name, u.phone, u.email, u.role, u.locked, s.expires_at
                            FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`).get(id);
    if (row && new Date(row.expires_at) > new Date() && !row.locked) {
      delete row.expires_at; delete row.locked; req.user = row;
    } else if (row) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    }
  }
  next();
}
const publicUser = (u) => (u ? { id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role } : null);
function requireUser(req, res, next) { if (!req.user) return res.status(401).json({ error: 'Vui lòng đăng nhập.' }); next(); }
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Vui lòng đăng nhập.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Chỉ quản trị viên mới có quyền này.' });
  next();
}
/* CSRF: state-changing API calls must carry the custom header X-HM-Request (sent by
   our fetch helper). Cross-site HTML forms cannot add it and there is no CORS, so a
   forged cross-site request is rejected; SameSite=Lax cookies are a second layer. */
function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-HM-Request') !== '1') return res.status(403).json({ error: 'Yêu cầu không hợp lệ.' });
  next();
}

/* ---------- Simple in-memory login throttle (per IP + email) ---------- */
const attempts = new Map();
function throttleKey(req, email) { return (req.ip || '') + '|' + String(email || '').toLowerCase(); }
function isThrottled(key) {
  const a = attempts.get(key);
  return a && a.count >= 8 && Date.now() - a.first < 15 * 60e3;
}
function noteFailure(key) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > 15 * 60e3) attempts.set(key, { count: 1, first: Date.now() });
  else a.count++;
}
const clearFailures = (key) => attempts.delete(key);

/* ---------- Validation ---------- */
const str = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const isPhone = (v) => /^\+?[0-9]{9,12}$/.test(String(v).replace(/[\s.-]/g, ''));
const toInt = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const bool = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
const isoOrNull = (v) => {
  const s = str(v, 40);
  if (!s) return null;
  const d = new Date(s.length === 10 ? s + 'T23:59:59+07:00' : s); // date-only = end of that day, Vietnam time
  return isNaN(d) ? fail(400, 'Ngày không hợp lệ.') : d.toISOString();
};
function slugify(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'bai-viet';
}

/* ---------- Access ---------- */
// Admins see everything; customers need an open, unexpired course_access row.
function accessFor(userId, courseId) {
  return db.prepare('SELECT is_open, expires_at FROM course_access WHERE user_id = ? AND course_id = ?').get(userId, courseId) || null;
}
function hasCourseAccess(user, courseId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const a = accessFor(user.id, courseId);
  return !!(a && a.is_open && (!a.expires_at || new Date(a.expires_at) > new Date()));
}

/* ---------- Bank transfer / VietQR ---------- */
const transferCode = (userId, courseId) => `HM${userId}K${courseId}`;
function bankInfo() {
  const s = getSettings();
  const bank = { bank_name: s.bank_name || '', bank_id: s.bank_id || '', account_no: s.account_no || '', account_name: s.account_name || '' };
  bank.configured = !!(bank.bank_id && bank.account_no && bank.account_name);
  bank.template = s.qr_template || 'compact2';
  return bank;
}
function vietQrUrl(bank, amount, code) {
  if (!bank.configured) return null;
  const q = new URLSearchParams({ amount: String(amount), addInfo: code, accountName: bank.account_name });
  return `https://img.vietqr.io/image/${encodeURIComponent(bank.bank_id)}-${encodeURIComponent(bank.account_no)}-${encodeURIComponent(bank.template)}.png?${q}`;
}

/* ---------- Uploads (validated by extension + magic bytes, random names) ---------- */
fs.mkdirSync(cfg.VIDEO_DIR, { recursive: true });
fs.mkdirSync(cfg.UPLOAD_DIR, { recursive: true });
const randomName = (ext) => crypto.randomBytes(16).toString('hex') + ext;
const IMAGE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const VIDEO_TYPES = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };

function makeUploader(dir, types, maxMb) {
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (req, file, cb) => cb(null, randomName(path.extname(file.originalname).toLowerCase().replace('.jpeg', '.jpg')))
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!types[ext]) return cb(new HttpError(400, 'Định dạng tệp không được hỗ trợ: ' + (ext || '(không có đuôi)')));
      cb(null, true);
    }
  });
}
const imageUpload = makeUploader(cfg.UPLOAD_DIR, IMAGE_TYPES, cfg.MAX_IMAGE_MB);
const videoUpload = makeUploader(cfg.VIDEO_DIR, VIDEO_TYPES, cfg.MAX_VIDEO_MB);

// Check the real content: rejects e.g. an HTML/SVG file renamed to .jpg
function sniff(file, kind) {
  const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(16); fs.readSync(fd, b, 0, 16, 0); fs.closeSync(fd);
  const hex = b.toString('hex');
  if (kind === 'image') {
    return hex.startsWith('ffd8ff') || hex.startsWith('89504e47') || hex.startsWith('47494638') ||
      (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP');
  }
  return b.toString('ascii', 4, 8) === 'ftyp' || hex.startsWith('1a45dfa3');
}
function acceptUpload(file, kind) {
  if (!file) return null;
  if (!sniff(file.path, kind)) { fs.rmSync(file.path, { force: true }); fail(400, 'Nội dung tệp không khớp định dạng ' + (kind === 'image' ? 'ảnh' : 'video') + '.'); }
  return file;
}
function removeUploadUrl(url) {
  // Only deletes files we own (/uploads/<random>.<ext>)
  const m = /^\/uploads\/([a-f0-9]{32}\.[a-z0-9]+)$/.exec(url || '');
  if (m) fs.rmSync(path.join(cfg.UPLOAD_DIR, m[1]), { force: true });
}

/* ---------- Embed URLs ---------- */
// Accepts YouTube (watch / youtu.be / embed / shorts) and Vimeo links; returns a safe embed URL.
function normalizeEmbed(url) {
  let u; try { u = new URL(str(url, 500)); } catch { fail(400, 'Link nhúng không hợp lệ.'); }
  if (u.protocol !== 'https:') fail(400, 'Link nhúng phải bắt đầu bằng https://');
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/) || [])[1];
  }
  if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const v = (u.pathname.match(/(\d{6,})/) || [])[1];
    if (v) return `https://player.vimeo.com/video/${v}`;
  }
  fail(400, 'Chỉ hỗ trợ link YouTube (không công khai/unlisted) hoặc Vimeo.');
}

/* ---------- Markdown → sanitized HTML (posts) ---------- */
marked.setOptions({ gfm: true, breaks: true });
function renderMarkdown(md) {
  const raw = marked.parse(String(md || ''));
  return sanitizeHtml(raw, {
    allowedTags: ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'em', 'del', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    allowedAttributes: { a: ['href', 'title', 'target', 'rel'], img: ['src', 'alt', 'title', 'loading', 'decoding'], th: ['align'], td: ['align'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    transformTags: {
      h1: 'h2', // the page already has the H1 (post title)
      a: (tag, attribs) => {
        const ext = /^https?:/i.test(attribs.href || '');
        const a = { href: attribs.href }; if (attribs.title) a.title = attribs.title;
        if (ext) { a.target = '_blank'; a.rel = 'noopener noreferrer nofollow'; }
        return { tagName: 'a', attribs: a };
      },
      img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy', decoding: 'async' } })
    }
  });
}

module.exports = {
  COOKIE, DUMMY_HASH, HttpError, fail, hashPassword, checkPassword, createSession, destroySession, loadUser, publicUser,
  requireUser, requireAdmin, csrfGuard, throttleKey, isThrottled, noteFailure, clearFailures,
  str, isEmail, isPhone, toInt, bool, isoOrNull, slugify, accessFor, hasCourseAccess, transferCode, bankInfo, vietQrUrl,
  imageUpload, videoUpload, acceptUpload, removeUploadUrl, IMAGE_TYPES, VIDEO_TYPES, normalizeEmbed, renderMarkdown
};
