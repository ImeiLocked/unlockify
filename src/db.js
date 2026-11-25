'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const config = require('./config');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT,
      is_admin      INTEGER NOT NULL DEFAULT 0,
      active        INTEGER NOT NULL DEFAULT 1,
      balance       REAL NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      description TEXT,
      icon        TEXT,
      sort        INTEGER NOT NULL DEFAULT 0,
      active      INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS services (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id       INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      title             TEXT NOT NULL,
      title_key         TEXT,                         -- titulo normalizado para emparejar proveedores
      identifier_type   TEXT NOT NULL DEFAULT 'imei', -- imei | serial
      markup_type       TEXT,                         -- NULL = global
      markup_value      REAL,
      auto_fulfill      INTEGER NOT NULL DEFAULT 0,   -- 1 = automatico con failover
      primary_provider  TEXT,                         -- para NO-auto: proveedor fijo (o NULL = manual/mas barato)
      active            INTEGER NOT NULL DEFAULT 0,   -- importados apagados por defecto
      sort              INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_services_titlekey ON services(title_key);

    -- Un servicio puede surtirse desde varios proveedores, cada uno con su costo
    CREATE TABLE IF NOT EXISTS service_sources (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id          INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      provider_key        TEXT NOT NULL,
      provider_service_id TEXT,
      cost                REAL NOT NULL DEFAULT 0,
      delivery_time       TEXT,
      active              INTEGER NOT NULL DEFAULT 1,
      UNIQUE(service_id, provider_key)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      code              TEXT UNIQUE NOT NULL,
      user_id           INTEGER NOT NULL REFERENCES users(id),
      service_id        INTEGER NOT NULL REFERENCES services(id),
      service_title     TEXT NOT NULL,
      identifier        TEXT NOT NULL,
      identifier_type   TEXT NOT NULL DEFAULT 'imei',
      price             REAL NOT NULL,            -- cobrado del saldo
      auto              INTEGER NOT NULL DEFAULT 0,
      status            TEXT NOT NULL DEFAULT 'queued', -- queued|processing|completed|rejected|cancelled
      provider_key      TEXT,                     -- proveedor que la resolvio / actual
      provider_order_id TEXT,
      result_text       TEXT,
      refunded          INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at           TEXT,
      completed_at      TEXT,
      total_seconds     INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

    -- Intentos por proveedor (para failover y tiempos)
    CREATE TABLE IF NOT EXISTS order_attempts (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      provider_key      TEXT NOT NULL,
      provider_order_id TEXT,
      cost              REAL,
      status            TEXT NOT NULL DEFAULT 'sent', -- sent|success|rejected|error
      result_text       TEXT,
      sent_at           TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at       TEXT,
      seconds           INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_attempts_order ON order_attempts(order_id);

    -- Recargas de saldo
    CREATE TABLE IF NOT EXISTS topups (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      code            TEXT UNIQUE NOT NULL,
      user_id         INTEGER NOT NULL REFERENCES users(id),
      chain           TEXT NOT NULL,           -- trc20 | erc20
      amount          REAL NOT NULL,           -- base solicitado
      expected_amount REAL NOT NULL,           -- con nonce, lo que debe enviar
      pay_address     TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending', -- pending|confirmed|expired
      tx_hash         TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at    TEXT,
      expires_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_topups_status ON topups(status);

    -- Libro de movimientos de saldo
    CREATE TABLE IF NOT EXISTS balance_ledger (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      type          TEXT NOT NULL,   -- topup|order|refund|admin_credit|admin_debit
      amount        REAL NOT NULL,   -- + suma, - resta
      balance_after REAL NOT NULL,
      ref           TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_user ON balance_ledger(user_id);

    CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT );

    -- Novedades / anuncios (nuevos servicios, cambios de precio, avisos)
    CREATE TABLE IF NOT EXISTS announcements (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      body       TEXT NOT NULL,
      kind       TEXT NOT NULL DEFAULT 'news',   -- news | price | new
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // --- migraciones ligeras: columnas de OTP / dispositivo de confianza ---
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  const add = (name, def) => { if (!cols.includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`); };
  add('trusted_device_token', 'TEXT');
  add('trusted_device_at', 'TEXT');
  add('otp_hash', 'TEXT');
  add('otp_expires', 'TEXT');
  add('otp_attempts', 'INTEGER DEFAULT 0');
  add('otp_sent_at', 'TEXT');
  // approval gate: 1 = can see prices / top up / buy. New registrations may be 0
  // (pending) depending on the auto_approve setting. Existing rows default to 1.
  add('approved', 'INTEGER NOT NULL DEFAULT 1');

  // --- migraciones: órdenes retenidas por saldo de proveedor insuficiente ---
  const ocols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  const oadd = (name, def) => { if (!ocols.includes(name)) db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${def}`); };
  oadd('held_funds', 'INTEGER NOT NULL DEFAULT 0'); // 1 = esperando que el admin recargue saldo del proveedor
  oadd('held_provider', 'TEXT');                    // proveedor cuyo saldo no alcanzó
  oadd('held_cost', 'REAL');                        // costo que no se pudo cubrir
  oadd('held_at', 'TEXT');

  // --- migraciones: origen de las novedades (manual vs automática) ---
  const acols = db.prepare('PRAGMA table_info(announcements)').all().map((c) => c.name);
  if (!acols.includes('source')) db.exec("ALTER TABLE announcements ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
}

// --- simple key/value settings (auto_approve, etc.) ----------------------
function getSetting(key, def = null) {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return r ? r.value : def;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, String(value));
}

function ensureAdmin() {
  const existing = db.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1').get();
  if (existing) return;
  const hash = bcrypt.hashSync(config.admin.password, 10);
  db.prepare('INSERT INTO users (email, password_hash, name, is_admin, active) VALUES (?, ?, ?, 1, 1)')
    .run(config.admin.email, hash, 'Administrator');
  console.log(`[db] Admin created: ${config.admin.email}`);
}

function normalizeTitle(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function seedCatalog(force = false) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM services').get().n;
  if (count > 0 && !force) {
    console.log('[db] Ya hay servicios; no se re-siembra.');
    return;
  }
  const file = path.join(__dirname, '..', 'data', 'catalog.sample.json');
  if (!fs.existsSync(file)) return;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  const insertCat = db.prepare('INSERT INTO categories (slug, name, description, icon, sort) VALUES (?,?,?,?,?)');
  const insertSvc = db.prepare(`INSERT INTO services (category_id, title, title_key, identifier_type, auto_fulfill, active, sort)
                                VALUES (?,?,?,?,?,1,?)`);
  const insertSrc = db.prepare(`INSERT INTO service_sources (service_id, provider_key, provider_service_id, cost, delivery_time)
                                VALUES (?,?,?,?,?)`);

  const tx = db.transaction(() => {
    if (force) db.exec('DELETE FROM service_sources; DELETE FROM services; DELETE FROM categories;');
    (data.categories || []).forEach((cat, ci) => {
      let c = db.prepare('SELECT id FROM categories WHERE slug = ?').get(cat.slug);
      const catId = c ? c.id : insertCat.run(cat.slug, cat.name, cat.description || '', cat.icon || '', ci).lastInsertRowid;
      (cat.services || []).forEach((s, si) => {
        const sid = insertSvc.run(catId, s.title, normalizeTitle(s.title), s.identifierType || 'imei', 0, si).lastInsertRowid;
        insertSrc.run(sid, 'imeilock', s.providerServiceId || '', s.providerCost || 0, s.deliveryTime || '');
      });
    });
  });
  tx();
  console.log(`[db] Catalogo demo sembrado: ${db.prepare('SELECT COUNT(*) AS n FROM services').get().n} servicios.`);
}

module.exports = { db, init, ensureAdmin, seedCatalog, normalizeTitle, getSetting, setSetting, DB_PATH };

if (require.main === module) {
  init(); ensureAdmin();
  if (process.argv.includes('--seed')) seedCatalog(process.argv.includes('--force'));
  console.log('[db] Listo.');
}
