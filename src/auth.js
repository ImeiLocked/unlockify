'use strict';
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('./db');
const config = require('./config');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const sqlDate = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const parseSql = (s) => Date.parse(String(s).replace(' ', 'T') + 'Z');

function createUser({ email, password, name, is_admin = 0, approved = 1 }) {
  email = String(email || '').trim().toLowerCase();
  name = String(name || '').trim();
  if (!EMAIL_RE.test(email)) throw new Error('auth.invalidEmail');
  if (!password || password.length < 6) throw new Error('auth.passwordMin');
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw new Error('auth.emailExists');
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (email,password_hash,name,is_admin,active,approved) VALUES (?,?,?,?,1,?)')
    .run(email, hash, name || null, is_admin ? 1 : 0, approved ? 1 : 0);
  return getUserById(info.lastInsertRowid);
}

function verifyUser(email, password) {
  email = String(email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user) return null;
  if (!bcrypt.compareSync(String(password || ''), user.password_hash)) return null;
  return user;
}

function getUserById(id) {
  return db.prepare('SELECT id,email,name,is_admin,active,approved,balance,created_at FROM users WHERE id=?').get(id);
}

function setPassword(userId, newPassword) {
  if (!newPassword || newPassword.length < 6) throw new Error('auth.passwordMin');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(newPassword, 10), userId);
}
function setActive(userId, active) { db.prepare('UPDATE users SET active=? WHERE id=?').run(active ? 1 : 0, userId); }
function setApproved(userId, approved) { db.prepare('UPDATE users SET approved=? WHERE id=?').run(approved ? 1 : 0, userId); }

// --- OTP (codigo por correo) --------------------------------------------
function createOtp(userId) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  db.prepare('UPDATE users SET otp_hash=?, otp_expires=?, otp_attempts=0, otp_sent_at=? WHERE id=?')
    .run(sha(code), sqlDate(Date.now() + config.otp.expiryMinutes * 60000), sqlDate(Date.now()), userId);
  return code;
}
function verifyOtp(userId, code) {
  const u = db.prepare('SELECT otp_hash, otp_expires, otp_attempts FROM users WHERE id=?').get(userId);
  if (!u || !u.otp_hash) return { ok: false, reason: 'no_otp' };
  if (parseSql(u.otp_expires) < Date.now()) return { ok: false, reason: 'expired' };
  if ((u.otp_attempts || 0) >= config.otp.maxAttempts) return { ok: false, reason: 'blocked' };
  if (sha(String(code || '').trim()) !== u.otp_hash) {
    db.prepare('UPDATE users SET otp_attempts=otp_attempts+1 WHERE id=?').run(userId);
    return { ok: false, reason: 'wrong' };
  }
  db.prepare('UPDATE users SET otp_hash=NULL, otp_expires=NULL, otp_attempts=0 WHERE id=?').run(userId);
  return { ok: true };
}
function canResend(userId) {
  const u = db.prepare('SELECT otp_sent_at FROM users WHERE id=?').get(userId);
  if (!u || !u.otp_sent_at) return true;
  return (Date.now() - parseSql(u.otp_sent_at)) >= config.otp.resendSeconds * 1000;
}

// --- dispositivo de confianza (uno por usuario) -------------------------
function setTrustedDevice(userId) {
  const raw = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE users SET trusted_device_token=?, trusted_device_at=? WHERE id=?')
    .run(sha(raw), sqlDate(Date.now()), userId); // guarda el hash; sobreescribe el anterior
  return raw;
}
function checkTrustedDevice(userId, rawToken) {
  if (!rawToken) return false;
  const u = db.prepare('SELECT trusted_device_token, trusted_device_at FROM users WHERE id=?').get(userId);
  if (!u || !u.trusted_device_token) return false;
  if (parseSql(u.trusted_device_at) < Date.now() - config.otp.trustedDays * 86400000) return false;
  return sha(rawToken) === u.trusted_device_token;
}

// --- middlewares ---------------------------------------------------------
function attachUser(req, res, next) {
  req.user = (req.session && req.session.userId) ? (getUserById(req.session.userId) || null) : null;
  res.locals.user = req.user;
  next();
}
function requireLogin(req, res, next) {
  if (!req.user) { req.session.returnTo = req.originalUrl; return res.redirect('/login'); }
  if (!req.user.is_admin && !req.user.active) {
    return res.status(403).render('error', { title: req.t('err.accountDisabled'), message: req.t('err.accountDisabledMsg') });
  }
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).render('error', { title: req.t('err.accessDenied'), message: req.t('err.adminsOnly') });
  next();
}

module.exports = {
  createUser, verifyUser, getUserById, setPassword, setActive, setApproved,
  createOtp, verifyOtp, canResend, setTrustedDevice, checkTrustedDevice,
  attachUser, requireLogin, requireAdmin,
};
