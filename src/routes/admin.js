'use strict';
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const auth = require('../auth');
const config = require('../config');
const { db, getSetting, setSetting } = require('../db');
const orders = require('../orders');
const catalog = require('../catalog');
const markupMod = require('../markup');
const providers = require('../providers');
const fulfillment = require('../providers/fulfillment');
const balance = require('../balance');
const topups = require('../topups');
const unmatched = require('../unmatched');
const notify = require('../notify');
const { makeT } = require('../i18n');

router.use(auth.requireLogin, auth.requireAdmin);

// --- Panel language (ES/EN). Default Spanish; saved in `panel_lang` cookie. ---
router.use((req, res, next) => {
  const lang = (req.cookies && req.cookies.panel_lang === 'en') ? 'en' : 'es';
  req.t = makeT(lang);
  req.lang = lang;
  res.locals.t = req.t;
  res.locals.lang = lang;
  res.locals.adminLang = lang;
  try { res.locals.supportPending = require('../support').pendingReplyCount(); } catch (_) { res.locals.supportPending = 0; }
  try { res.locals.heldCount = orders.countHeld(); } catch (_) { res.locals.heldCount = 0; }
  try { res.locals.unmatchedCount = unmatched.countPending(); } catch (_) { res.locals.unmatchedCount = 0; }
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

// ---------- My account: admin changes their own panel password ----------
router.get('/account', (req, res) => {
  res.render('admin/account', { title: req.t('acctAdmin.title'), layoutAdmin: true, ok: false, error: null });
});
router.post('/account/password', (req, res) => {
  const { current, password, confirm } = req.body;
  const show = (ok, error) => res.render('admin/account', { title: req.t('acctAdmin.title'), layoutAdmin: true, ok, error });
  if (!auth.verifyUser(req.user.email, current || '')) return show(false, req.t('acctAdmin.errCurrent'));
  if (!password || password.length < 6) return show(false, req.t('acctAdmin.errMin'));
  if (password !== confirm) return show(false, req.t('acctAdmin.errMatch'));
  try { auth.setPassword(req.user.id, password); } catch (e) { return show(false, req.t('acctAdmin.errMin')); }
  show(true, null);
});

// ---------- Ordenes ----------
router.get('/orders', (req, res) => {
  const status = req.query.status || 'all';
  res.render('admin/orders', { title: req.t('orders.title'), layoutAdmin: true, orders: orders.adminList({ status }), status, providerName: providers.providerName });
});
router.get('/orders/:code', (req, res) => {
  const order = orders.getByCode(req.params.code);
  if (!order) return res.status(404).render('error', { title: req.t('err.notFound'), message: req.t('err.orderNotFound') });
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
    services: catalog.getAllServicesAdmin(), markup: markupMod.getGlobalMarkup(),
    providers: config.providers, synced: req.query.synced, providerName: providers.providerName,
  });
});
// Save the global profit percentage (applies to services without a custom % or fixed price)
router.post('/markup/global', (req, res) => {
  const v = Number(req.body.value);
  if (Number.isFinite(v)) { setSetting('markup_type', 'percent'); setSetting('markup_value', v); }
  res.redirect('/admin/services');
});
// Bulk-raise every fixed-price service by a percentage
router.post('/markup/bump-fixed', (req, res) => {
  const pct = Number(req.body.pct);
  if (Number.isFinite(pct) && pct !== 0) {
    db.prepare("UPDATE services SET markup_value = ROUND(markup_value * (1 + ?/100.0), 2) WHERE markup_type='fixed' AND markup_value IS NOT NULL").run(pct);
  }
  res.redirect('/admin/services');
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
  try { const r = await require('../catalognews').syncAndAnnounce(req.params.provider); res.redirect(`/admin/services?synced=${encodeURIComponent(JSON.stringify(r))}`); }
  catch (e) { res.status(400).render('error', { title: 'Sync error', message: e.message }); }
});

// ---------- Proveedores: catálogo separado por proveedor, publicar/ocultar ----------
router.get('/providers', (req, res) => {
  const list = config.providers.filter((p) => p.enabled && p.apiUrl);
  const active = list.find((p) => p.key === req.query.p) ? req.query.p : (list[0] && list[0].key);
  const counts = {};
  list.forEach((p) => { counts[p.key] = catalog.providerServiceCounts(p.key); });
  res.render('admin/providers', {
    title: 'Proveedores', layoutAdmin: true,
    provList: list, activeProvider: active,
    rows: active ? catalog.getServicesByProvider(active) : [],
    counts, providerName: providers.providerName,
    onlyPublished: req.query.pub === '1',
  });
});

// Publicar un servicio a la tienda surtido por ESTE proveedor
router.post('/providers/:provider/:id/publish', (req, res) => {
  const { provider, id } = req.params;
  const svc = db.prepare('SELECT id, title, active FROM services WHERE id=?').get(id);
  db.prepare('UPDATE service_sources SET active=1 WHERE service_id=? AND provider_key=?').run(id, provider);
  db.prepare('UPDATE services SET active=1, auto_fulfill=1, primary_provider=? WHERE id=?').run(provider, id);
  if (svc && !svc.active) {
    try {
      const src = db.prepare('SELECT cost FROM service_sources WHERE service_id=? AND provider_key=?').get(id, provider);
      const s = db.prepare('SELECT markup_type, markup_value FROM services WHERE id=?').get(id);
      const price = require('../markup').sellPrice(src ? src.cost : 0, { markupType: s.markup_type, markupValue: s.markup_value });
      require('../catalognews').announceNewService(svc.title, price);
    } catch (_) {}
  }
  res.redirect('/admin/providers?p=' + encodeURIComponent(provider) + (req.query.pub ? '&pub=1' : '') + '#s' + id);
});

// Ocultar: apaga la fuente de este proveedor; si no queda ninguna fuente activa, oculta el servicio
router.post('/providers/:provider/:id/hide', (req, res) => {
  const { provider, id } = req.params;
  db.prepare('UPDATE service_sources SET active=0 WHERE service_id=? AND provider_key=?').run(id, provider);
  const other = db.prepare('SELECT provider_key FROM service_sources WHERE service_id=? AND active=1 ORDER BY cost ASC LIMIT 1').get(id);
  if (!other) db.prepare('UPDATE services SET active=0 WHERE id=?').run(id);
  else db.prepare('UPDATE services SET primary_provider=? WHERE id=? AND primary_provider=?').run(other.provider_key, id, provider);
  res.redirect('/admin/providers?p=' + encodeURIComponent(provider) + (req.query.pub ? '&pub=1' : '') + '#s' + id);
});

// Saldo en vivo de un proveedor (JSON, para mostrar en la pestaña)
router.get('/providers/:key/balance', async (req, res) => {
  try { const credit = await providers.getCredit(req.params.key); res.json({ credit }); }
  catch (e) { res.json({ credit: null, error: e.message }); }
});

// ---------- Pendientes por saldo: órdenes retenidas esperando recarga ----------
router.get('/held', (req, res) => {
  const held = orders.listHeld().map((o) => ({
    ...o,
    waited: orders.secondsSince(o.held_at || o.created_at),
    provider_name: providers.providerName(o.held_provider),
  }));
  res.render('admin/held', { title: 'Pendientes', layoutAdmin: true, held });
});
router.get('/held/count', (req, res) => { res.json({ held: orders.countHeld() }); });
router.post('/held/:id/retry', async (req, res) => {
  const o = orders.getById(req.params.id);
  if (!o) return res.redirect('/admin/held');
  try { await fulfillment.retryHeld(o.id); }
  catch (e) { console.error('[admin] retryHeld:', e.message); }
  res.redirect('/admin/held');
});

// ---------- Pagos sin emparejar: llegó USDT que no calzó con ninguna factura ----------
router.get('/unmatched', (req, res) => {
  const items = unmatched.listPending().map((p) => ({
    ...p,
    guess: unmatched.guessClient(p),
    candidates: unmatched.candidates(p),
  }));
  res.render('admin/unmatched', { title: 'Pagos sin emparejar', layoutAdmin: true, items });
});
router.get('/unmatched/count', (req, res) => { res.json({ unmatched: unmatched.countPending() }); });
router.post('/unmatched/:id/credit', (req, res) => {
  const p = unmatched.getById(req.params.id);
  const userId = Number(req.body.user_id);
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  if (p && p.status === 'pending' && Number.isFinite(userId) && Number.isFinite(amount) && amount > 0) {
    const u = db.prepare('SELECT id FROM users WHERE id=?').get(userId);
    if (u) {
      balance.credit(u.id, amount, 'admin_payment', `USDT ${p.tx_hash}`.slice(0, 80));
      unmatched.resolve(p.id, u.id);
    }
  }
  res.redirect('/admin/unmatched');
});
router.post('/unmatched/:id/dismiss', (req, res) => {
  unmatched.dismiss(req.params.id);
  res.redirect('/admin/unmatched');
});

// ---------- Usuarios ----------
router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id,email,name,active,approved,balance,is_admin,created_at FROM users ORDER BY is_admin DESC, id DESC').all();
  res.render('admin/users', {
    title: req.t('users.title'), layoutAdmin: true, users,
    autoApprove: getSetting('auto_approve', '0') === '1',
    error: req.query.error || null,
  });
});
router.post('/users', (req, res) => {
  try { auth.createUser({ email: req.body.email, password: req.body.password, name: req.body.name, approved: 1 }); res.redirect('/admin/users'); }
  catch (e) { res.redirect('/admin/users?error=' + encodeURIComponent(req.t(e.message))); }
});
// Toggle global auto-approval of new registrations.
router.post('/settings/auto-approve', (req, res) => {
  const cur = getSetting('auto_approve', '0') === '1';
  setSetting('auto_approve', cur ? '0' : '1');
  res.redirect('/admin/users');
});
router.get('/users/:id', (req, res) => {
  const u = db.prepare('SELECT id,email,name,active,approved,balance,is_admin,created_at FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.redirect('/admin/users');
  let newPassword = null;
  if (req.session.resetPwUser && String(req.session.resetPwUser) === String(u.id)) { newPassword = req.session.resetPw; req.session.resetPwUser = null; req.session.resetPw = null; }
  const sum = (sql) => db.prepare(sql).get(u.id).n;
  const stats = {
    // lifetime recharged = confirmed on-chain top-ups + payments logged by admin (other methods)
    recharged: sum("SELECT COALESCE(SUM(expected_amount),0) n FROM topups WHERE user_id=? AND status='confirmed'")
             + sum("SELECT COALESCE(SUM(amount),0) n FROM balance_ledger WHERE user_id=? AND type='admin_payment'"),
    gifts: sum("SELECT COALESCE(SUM(amount),0) n FROM balance_ledger WHERE user_id=? AND type='admin_gift'"),
    servicesCount: sum("SELECT COUNT(*) n FROM orders WHERE user_id=? AND status='completed'"),
    totalSpent: sum("SELECT COALESCE(SUM(price),0) n FROM orders WHERE user_id=? AND status='completed'"),
  };
  res.render('admin/user', {
    title: u.email, layoutAdmin: true, u, newPassword, stats,
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
router.post('/users/:id/approve', (req, res) => {
  const u = db.prepare('SELECT id,is_admin,approved FROM users WHERE id=?').get(req.params.id);
  if (u && !u.is_admin) auth.setApproved(u.id, u.approved ? 0 : 1);
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
  const reason = String(req.body.reason || '');
  const note = String(req.body.note || '').slice(0, 80) || null;
  if (u && Number.isFinite(amount) && amount !== 0) {
    if (amount > 0) {
      // payment (other method) and gift count toward lifetime stats; correction does not
      const type = reason === 'gift' ? 'admin_gift' : (reason === 'payment' ? 'admin_payment' : 'admin_credit');
      balance.credit(u.id, amount, type, note);
    } else {
      balance.debit(u.id, Math.abs(amount), 'admin_debit', note);
    }
  }
  res.redirect('/admin/users/' + req.params.id);
});

// Permanently delete a user and all their records (orders cascade their attempts).
router.post('/users/:id/delete', (req, res) => {
  const u = db.prepare('SELECT id,is_admin FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.redirect('/admin/users');
  if (u.is_admin) return res.redirect('/admin/users/' + u.id); // never delete an admin
  const wipe = db.transaction((uid) => {
    db.prepare('DELETE FROM orders WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM topups WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM balance_ledger WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM users WHERE id=?').run(uid);
  });
  wipe(u.id);
  res.redirect('/admin/users');
});

// ---------- Recargas ----------
router.get('/topups', (req, res) => {
  res.render('admin/topups', { title: req.t('topups.title'), layoutAdmin: true, topups: topups.adminList(300) });
});

// ---------- Soporte (buzón traducido) ----------
const support = require('../support');

router.get('/support', (req, res) => {
  res.render('admin/support', {
    title: req.t('support.title'), layoutAdmin: true,
    threads: support.listThreads(200), imapOn: config.imap.enabled,
  });
});

// Conteo en vivo de pendientes por responder (para el badge del menú).
router.get('/support/pending-count', (req, res) => {
  res.json({ pending: support.pendingReplyCount() });
});

router.get('/support/:id', (req, res) => {
  const data = support.getThread(req.params.id);
  if (!data) return res.redirect('/admin/support');
  support.markRead(data.thread.id);
  res.render('admin/support_thread', {
    title: data.thread.subject || req.t('support.title'), layoutAdmin: true,
    thread: data.thread, messages: data.messages,
    ok: req.query.ok === '1', error: null, imapOn: config.imap.enabled,
  });
});

// Marcar como respondido sin enviar correo (mensajes que no requieren respuesta).
router.post('/support/:id/resolve', (req, res) => {
  const data = support.getThread(req.params.id);
  if (data) support.markResolved(data.thread.id);
  res.redirect('/admin/support');
});

router.post('/support/:id/reply', async (req, res) => {
  const data = support.getThread(req.params.id);
  if (!data) return res.redirect('/admin/support');
  const body = String(req.body.body || '').trim();
  const fail = (error) => res.render('admin/support_thread', {
    title: data.thread.subject, layoutAdmin: true, thread: data.thread,
    messages: support.getThread(data.thread.id).messages, ok: false, error, imapOn: config.imap.enabled,
  });
  if (!body) return fail(req.t('support.errEmpty'));
  try {
    const ok = await support.sendReply(data.thread.id, body);
    if (!ok) return fail(req.t('support.errSend'));
  } catch (e) { console.error('[support reply]', e.message); return fail(req.t('support.errSend')); }
  res.redirect('/admin/support/' + data.thread.id + '?ok=1');
});

// ---------- Novedades / anuncios ----------
const announcements = require('../announcements');
router.get('/announcements', (req, res) => {
  res.render('admin/announcements', { title: 'Novedades', layoutAdmin: true, items: announcements.listAll(300) });
});
router.post('/announcements', (req, res) => {
  announcements.add(req.body.body, req.body.kind);
  res.redirect('/admin/announcements');
});
router.post('/announcements/:id/toggle', (req, res) => { announcements.toggle(req.params.id); res.redirect('/admin/announcements'); });
router.post('/announcements/:id/delete', (req, res) => { announcements.remove(req.params.id); res.redirect('/admin/announcements'); });

module.exports = router;
