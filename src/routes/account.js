'use strict';
const express = require('express');
const router = express.Router();
const config = require('../config');
const auth = require('../auth');
const notify = require('../notify');
const orders = require('../orders');
const topups = require('../topups');
const balance = require('../balance');

function otpActive() { return config.otp.enabled && config.email.enabled; }
function landing(user) { return user.is_admin ? '/admin' : '/account'; }

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/account');
  res.render('register', { title: req.t('reg.title'), error: null, form: {} });
});
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  try {
    const user = auth.createUser({ name, email, password });
    req.session.userId = user.id;
    const to = req.session.returnTo || '/account'; delete req.session.returnTo;
    res.redirect(to);
  } catch (e) { res.status(400).render('register', { title: req.t('reg.title'), error: req.t(e.message), form: { name, email } }); }
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/account');
  res.render('login', { title: req.t('site.login'), error: null, form: {} });
});
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = auth.verifyUser(email, password);
  if (!user) return res.status(401).render('login', { title: req.t('site.login'), error: req.t('login.errBadCreds'), form: { email } });
  if (!user.is_admin && !user.active) return res.status(403).render('login', { title: req.t('site.login'), error: req.t('login.errDisabled'), form: { email } });

  // no OTP (or no email configured): log in directly
  if (!otpActive()) { req.session.userId = user.id; const to = req.session.returnTo || landing(user); delete req.session.returnTo; return res.redirect(to); }

  // trusted device: skip OTP
  const td = req.cookies && req.cookies.td;
  if (auth.checkTrustedDevice(user.id, td)) { req.session.userId = user.id; const to = req.session.returnTo || landing(user); delete req.session.returnTo; return res.redirect(to); }

  // send OTP by email
  const code = auth.createOtp(user.id);
  notify.sendOtp(user.email, code).catch(() => {});
  req.session.pendingUserId = user.id;
  res.redirect('/login/otp');
});

router.get('/login/otp', (req, res) => {
  if (req.user) return res.redirect('/account');
  if (!req.session.pendingUserId) return res.redirect('/login');
  const u = auth.getUserById(req.session.pendingUserId);
  res.render('otp', { title: req.t('otp.title'), email: u ? u.email : '', error: null, resend: config.otp.resendSeconds });
});
router.post('/login/otp', (req, res) => {
  const uid = req.session.pendingUserId;
  if (!uid) return res.redirect('/login');
  const code = Array.isArray(req.body.d) ? req.body.d.join('') : String(req.body.code || '');
  const r = auth.verifyOtp(uid, code);
  if (!r.ok) {
    const msg = { expired: req.t('otp.errExpired'), blocked: req.t('otp.errBlocked'), wrong: req.t('otp.errWrong') }[r.reason] || req.t('otp.errInvalid');
    const u = auth.getUserById(uid);
    return res.status(401).render('otp', { title: req.t('otp.title'), email: u ? u.email : '', error: msg, resend: config.otp.resendSeconds });
  }
  const user = auth.getUserById(uid);
  req.session.userId = uid; delete req.session.pendingUserId;
  if (req.body.trust_device) {
    const raw = auth.setTrustedDevice(uid);
    res.cookie('td', raw, { maxAge: config.otp.trustedDays * 86400000, httpOnly: true, sameSite: 'lax', secure: config.isProd });
  }
  const to = req.session.returnTo || landing(user); delete req.session.returnTo;
  res.redirect(to);
});
router.post('/login/otp/resend', (req, res) => {
  const uid = req.session.pendingUserId;
  if (!uid) return res.redirect('/login');
  if (auth.canResend(uid)) {
    const u = auth.getUserById(uid);
    const code = auth.createOtp(uid);
    notify.sendOtp(u.email, code).catch(() => {});
  }
  res.redirect('/login/otp');
});

router.post('/logout', (req, res) => {
  // Reset the public site to English on logout (language choice is per-session).
  res.clearCookie('site_lang', { httpOnly: true, sameSite: 'lax', secure: config.isProd });
  req.session.destroy(() => res.redirect('/'));
});

router.get('/account', auth.requireLogin, (req, res) => {
  res.render('account', {
    title: req.t('site.myAccount'),
    balance: balance.getBalance(req.user.id),
    orders: orders.listForUser(req.user.id),
    topups: topups.listForUser(req.user.id),
    ledger: balance.ledger(req.user.id, 20),
  });
});

module.exports = router;
