'use strict';
const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const SQLiteStore = require('connect-sqlite3')(session);

const config = require('./config');
const dbModule = require('./db');
const auth = require('./auth');
const notify = require('./notify');
const payments = require('./payments');
const balance = require('./balance');
const fulfillment = require('./providers/fulfillment');
const support = require('./support');
const { makeT } = require('./i18n');

dbModule.init();
dbModule.ensureAdmin();
dbModule.seedCatalog();

const app = express();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use('/static', express.static(path.join(__dirname, '..', 'public')));
// Con OTP activo la sesión expira por inactividad (idleMinutes); si no, dura 30 días.
const sessionMaxAge = config.otp.enabled ? config.otp.idleMinutes * 60000 : 1000 * 60 * 60 * 24 * 30;
app.use(session({
  store: new SQLiteStore({ dir: path.join(__dirname, '..', 'data'), db: 'sessions.db' }),
  secret: config.sessionSecret, resave: false, saveUninitialized: false, rolling: true,
  cookie: { maxAge: sessionMaxAge, httpOnly: true, sameSite: 'lax', secure: config.isProd },
}));
app.use(auth.attachUser);
app.use((req, res, next) => {
  // Public storefront language: default English, customer can switch to Spanish.
  const lang = (req.cookies && req.cookies.site_lang === 'es') ? 'es' : 'en';
  req.lang = lang;
  req.t = makeT(lang);
  res.locals.lang = lang;
  res.locals.t = req.t;
  res.locals.brand = config.brandName;
  res.locals.publicUrl = config.publicUrl;
  res.locals.supportEmail = config.email.from || config.zoho.from || config.imap.user || 'support@unlockify.uk';
  res.locals.year = new Date().getFullYear();
  res.locals.currentPath = req.path;
  res.locals.layoutAdmin = false;
  res.locals.userBalance = req.user && !req.user.is_admin ? balance.getBalance(req.user.id) : null;
  // canBuy: may see prices, add funds and order. Admins always; customers only once approved.
  res.locals.canBuy = !!(req.user && (req.user.is_admin || req.user.approved));
  res.locals.pending = !!(req.user && !req.user.is_admin && !req.user.approved);
  next();
});

// Switch public site language (customer-facing). Admin uses /admin/lang/:lang.
// Session cookie (no maxAge): the choice lasts only the current session; a new
// visit or logout returns to English. Emails stay English.
app.get('/lang/:lang', (req, res) => {
  const lang = req.params.lang === 'es' ? 'es' : 'en';
  res.cookie('site_lang', lang, { httpOnly: true, sameSite: 'lax', secure: config.isProd });
  let back = '/';
  try { const u = new URL(req.get('referer')); if (u.pathname.indexOf('/admin') !== 0) back = u.pathname + (u.search || ''); } catch (e) {}
  res.redirect(back);
});

app.use('/', require('./routes/public'));
app.use('/', require('./routes/account'));
app.use('/', require('./routes/order'));
app.use('/', require('./routes/topup'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).render('error', { title: req.t ? req.t('err.notFound') : 'Not found', message: (req.t && req.lang === 'es') ? 'La página que buscas no existe.' : 'The page you are looking for does not exist.' }));
app.use((err, req, res, next) => { console.error('[error]', err); res.status(500).render('error', { title: 'Error', message: (req.lang === 'es') ? 'Ocurrió un error inesperado.' : 'An unexpected error occurred.' }); });

// --- recarga confirmada -> avisar ---
async function onTopupConfirmed(topup) {
  await notify.notifyAdminTopup(topup, topup.new_balance).catch(() => {});
  await notify.notifyTopupConfirmed(topup, topup.new_balance, topup.user_email).catch(() => {});
}

payments.startWatcher(onTopupConfirmed);
fulfillment.startPoller();
support.startPoller();

app.listen(config.port, () => {
  console.log(`\n🚀 ${config.brandName} on port ${config.port}  |  ${config.publicUrl}`);
  const chains = payments.availableChains().map((c) => c.key.toUpperCase());
  const provs = config.enabledProviders().map((p) => p.name);
  console.log(`   USDT networks: ${chains.join(', ') || 'NONE'}  |  Auto providers: ${provs.join(', ') || 'NONE (manual mode)'}  |  Telegram: ${config.telegram.enabled ? 'ON' : 'OFF'}\n`);
});
