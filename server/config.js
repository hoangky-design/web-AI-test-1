/* Runtime config from .env (see .env.example). Bank info: editable in the admin
   "Cài đặt" tab (stored in the DB); the BANK_* values here only seed it on first run. */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const ROOT = path.join(__dirname, '..');
const env = process.env;
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

module.exports = {
  ROOT,
  PORT: int(env.PORT, 8080),
  HOST: env.HOST || '0.0.0.0',
  PUBLIC_DIR: path.join(ROOT, 'public'),
  DB_FILE: path.resolve(ROOT, env.DB_FILE || 'data/hinton.db'),
  VIDEO_DIR: path.resolve(ROOT, env.VIDEO_DIR || 'storage/videos'),
  UPLOAD_DIR: path.resolve(ROOT, env.UPLOAD_DIR || 'storage/uploads'),
  MAX_VIDEO_MB: int(env.MAX_VIDEO_MB, 2048),
  MAX_IMAGE_MB: int(env.MAX_IMAGE_MB, 5),
  SESSION_DAYS: int(env.SESSION_DAYS, 30),
  COOKIE_SECURE: /^(1|true|yes)$/i.test(env.COOKIE_SECURE || ''),
  TRUST_PROXY: env.TRUST_PROXY || '',
  ADMIN_EMAIL: env.ADMIN_EMAIL || '',
  ADMIN_PASSWORD: env.ADMIN_PASSWORD || '',
  ADMIN_NAME: env.ADMIN_NAME || 'Quản trị viên',
  BANK_SEED: {
    bank_name: env.BANK_NAME || '',
    bank_id: env.BANK_ID || '',            // VietQR bank code or BIN, e.g. VCB / 970436
    account_no: env.BANK_ACCOUNT_NO || '',
    account_name: env.BANK_ACCOUNT_NAME || '',
    qr_template: env.VIETQR_TEMPLATE || 'compact2'
  }
};
