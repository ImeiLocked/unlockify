'use strict';
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const auth = require('../auth');
const config = require('../config');
const { db } = require('../db');
const orders = require('../orders');
const catalog = require('../catalog');
const providers = require('../providers');
const fulfillment = require('../providers/fulfillment');
const balance = require('../balance');
const topups = require('../topups');
const notify = require('../notify');
const { makeT } = require('../i18n');

router.use(auth.requireLogin, auth.requireAdmin);

// --- Panel language (ES/EN). Default Spanish; saved in `panel_lang` cookie. ---
router.use((req, res, next) => {
  const lang = (req.cookies && req.cookies.panel_lang === 'en') ? 'en' : 'es';
  req.t = makeT(lang);
  res.locals.t = req.t;
  res.locals.adminLang = lang;
  next();
});
router.get('/lang/:lang', (req, res) => {
  const lang = req.params.lang === 'en' ? 'en' : 'es';
  res.cookie('panel_lang', lang, { maxAge: 365 * 86400000, httpOnly: true, sameSite: 'lax', secure: config.isProd });
  let back = '/admin';
  try { const u = new URL(req.get('referer')); if (u.pathname.indexOf('/admin') === 0) back = u.pathname + (u.search || ''); } catch (e) {}
  res.redirect(back);
});

function genPassword() { return crypto.randomBytes(5).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) + '7x'; }

// ---------- Dashboard ----------
router.get('/', (req, res) => {
  res.render('admin/dashboard', {
    title: req.t('dash.title'), layoutAdmin: true,
    stats: orders.stats(),
    recent: orders.adminList({ status: 'all' }).slice(0, 12),
    providers: config.providers,
    usersCount: db.prepare('SELECT COUNT(*) n FROM users WHERE is_admin=0').get().n,
    pendingTopups: db.prepare("SELECT COUNT(*) n FROM topups WHERE status='pending'").get().n,
  });
});

// ---------- Ordenes ----------
router.get('/orders', (req, res) => {
  const status = req.query.status || 'all';
  res.render('admin/orders', { title: req.t('orders.title'), layoutAdmin: true, orders: orders.adminList({ status }), status, providerName: providers.providerName });
});
router.get('/orders/:code', (req, res) => {
  const order = orders.getByCode(req.params.code);
  if (!order) return res.status(404).render('error', { title: 'Not found', message: 'Order not found.' });
  const customer = db.prepare('SELECT email,name FROM users WHERE id=?').get(order.user_id);
  res.render('admin/order', {
    title: `${req.t('order.title')} ${order.code}`, layoutAdmin: true, order, customer,
    attempts: orders.listAttempts(order.id), providerName: providers.providerName,
  });
});
router.post('/orders/:id/complete', async (req, res) => {
  const order = orders.getById(req.params.id);
  if (!order) return res.redirect('/admin/orders');
  const result = String(req.body.result_text || '').trim();
  const done = orders.complete(order.id, result, order.provider_key);
  const u = db.prepare('SELECT email FROM users WHERE id=?').get(order.user_id);
  notify.notifyOrderCompleted(done, u && u.email).catch(() => {});
  res.redirect(`/admin/orders/${order.code}`);
});
router.post('/orders/:id/reject', async (req, res) => {
  const order = orders.getById(req.params.id);
  if (!order) return res.redirect('/admin/orders');
  if (order.status !== 'rejected') {
    orders.reject(order.id);
    if (!order.refunded) { balance.credit(order.user_id, order.price, 'refund', order.code); orders.markRefunded(order.id); }
    const u = db.prepare('SELECT email FROM users WHERE id=?').get(order.user_id);
    notify.notifyOrderRejected(orders.getById(order.id), u && u.email).catch(() => {});
  }
  res.redirect(`/admin/orders/${order.code}`);
});
router.post('/orders/:id/retry', async (req, res) => {
  const order = orders.getById(req.params.id);
  if (order) await fulfillment.advance(order).catch((e) => console.error('[admin] retry:', e.message));
  res.redirect(`/admin/orders/${order ? order.code : ''}`);
});

// ---------- Servicios ----------
router.get('/services', (req, res) => {
  res.render('admin/services', {
    title: req.t('services.title'), layoutAdmin: true,
    services: catalog.getAllServicesAdmin(), markup: config.markup,
    providers: config.providers, synced: req.query.synced, providerName: providers.providerName,
  });
});
router.post('/services/:id', (req, res) => {
  const b = req.body;
  db.prepare(`UPDATE services SET title=COALESCE(NULLIF(@title,''),title), identifier_type=@idt,
      markup_type=NULLIF(@mt,''), markup_value=CASE WHEN @mv='' THEN NULL ELSE @mv END,
      auto_fulfill=@auto, primary_provider=NULLIF(@primary,''), active=@active WHERE id=@id`)
    .run({
      id: req.params.id, title: b.title || '', idt: b.identifier_type === 'serial' ? 'serial' : 'imei',
      mt: b.markup_type || '', mv: b.markup_value === undefined ? '' : String(b.markup_value),
      auto: b.auto_fulfill ? 1 : 0, primary: b.primary_provider || '', active: b.active ? 1 : 0,
    });
  res.redirect('/admin/services#s' + req.params.id);
});
router.post('/sources/:id', (req, res) => {
  const b = req.body;
  db.prepare('UPDATE service_sources SET cost=@cost, provider_service_id=@psid, active=@active WHERE id=@id')
    .run({ id: req.params.id, cost: Number(b.cost) || 0, psid: b.provider_service_id || '', active: b.active ? 1 : 0 });
  res.redirect('/admin/services');
});
router.post('/services/:id/sources', (req, res) => {
  const b = req.body;
  if (b.provider_key) {
    try {
      db.prepare('INSERT INTO service_sources (service_id,provider_key,provider_service_id,cost,active) VALUES (?,?,?,?,1)')
        .run(req.params.id, b.provider_key, b.provider_service_id || '', Number(b.cost) || 0);
    } catch (e) { /* ya existe esa fuente */ }
  }
  res.redirect('/admin/services');
});
router.post('/sync/:provider', async (req, res) => {
  try { const r = await providers.syncCatalog(req.params.provider); res.redirect(`/admin/services?synced=${encodeURIComponent(JSON.stringify(r))}`); }
  catch (e) { res.status(400).render('error', { title: 'Sync error', message: e.message }); }
});

// ---------- Usuarios ----------
router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id,email,name,active,balance,is_admin,created_at FROM users ORDER BY is_admin DESC, id DESC').all();
  res.render('admin/users', { title: req.t('users.title'), layoutAdmin: true, users, error: req.query.error || null });
});
router.post('/users', (req, res) => {
  try { auth.createUser({ email: req.body.email, password: req.body.password, name: req.body.name }); res.redirect('/admin/users'); }
  catch (e) { res.redirect('/admin/users?error=' + encodeURIComponent(e.message)); }
});
router.get('/users/:id', (req, res) => {
  const u = db.prepare('SELECT id,email,name,active,balance,is_admin,created_at FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.redirect('/admin/users');
  let newPassword = null;
  if (req.session.resetPwUser && String(req.session.resetPwUser) === String(u.id)) { newPassword = req.session.resetPw; req.session.resetPwUser = null; req.session.resetPw = null; }
  res.render('admin/user', {
    title: u.email, layoutAdmin: true, u, newPassword,
    orders: db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 30').all(u.id),
    topups: db.prepare('SELECT * FROM topups WHERE user_id=? ORDER BY id DESC LIMIT 20').all(u.id),
    ledger: balance.ledger(u.id, 30),
  });
});
router.post('/users/:id/active', (req, res) => {
  const u = db.prepare('SELECT id,is_admin,active FROM users WHERE id=?').get(req.params.id);
  if (u && !u.is_admin) auth.setActive(u.id, u.active ? 0 : 1);
  res.redirect('/admin/users/' + req.params.id);
});
router.post('/users/:id/password', (req, res) => {
  const u = db.prepare('SELECT id FROM users WHERE id=?').get(req.params.id);
  if (u) {
    const pw = (req.body.password && req.body.password.length >= 6) ? req.body.password : genPassword();
    try { auth.setPassword(u.id, pw); req.session.resetPwUser = u.id; req.session.resetPw = pw; } catch (e) {}
  }
  res.redirect('/admin/users/' + req.params.id);
});
router.post('/users/:id/balance', (req, res) => {
  const u = db.prepare('SELECT id FROM users WHERE id=?').get(req.params.id);
  const amount = Number(req.body.amount);
  const note = String(req.body.note || 'admin adjustment').slice(0, 80);
  if (u && Number.isFinite(amount) && amount !== 0) {
    if (amount > 0) balance.credit(u.id, amount, 'admin_credit', note);
    else balance.debit(u.id, Math.abs(amount), 'admin_debit', note);
  }
  res.redirect('/admin/users/' + req.params.id);
});

// ---------- Recargas ----------
router.get('/topups', (req, res) => {
  res.render('admin/topups', { title: req.t('topups.title'), layoutAdmin: true, topups: topups.adminList(300) });
});

module.exports = router;
