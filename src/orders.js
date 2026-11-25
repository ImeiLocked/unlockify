'use strict';
const crypto = require('crypto');
const { db } = require('./db');

const STATUS = {
  QUEUED: 'queued',          // esperando proceso (manual)
  PROCESSING: 'processing',  // enviada a un proveedor (auto)
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

function parseSql(s) { return Date.parse(String(s).replace(' ', 'T') + 'Z'); }
function secondsSince(sqlTime) { return Math.max(0, Math.round((Date.now() - parseSql(sqlTime)) / 1000)); }

function generateCode(prefix = 'ULK') {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  const b = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += alphabet[b[i] % alphabet.length];
  return `${prefix}-${s}`;
}

function createOrder(data) {
  let code = generateCode();
  while (db.prepare('SELECT 1 FROM orders WHERE code = ?').get(code)) code = generateCode();
  const info = db.prepare(`
    INSERT INTO orders (code, user_id, service_id, service_title, identifier, identifier_type, price, auto, status)
    VALUES (@code,@user_id,@service_id,@service_title,@identifier,@identifier_type,@price,@auto,@status)
  `).run({
    code,
    user_id: data.user_id,
    service_id: data.service_id,
    service_title: data.service_title,
    identifier: data.identifier,
    identifier_type: data.identifier_type,
    price: data.price,
    auto: data.auto ? 1 : 0,
    status: data.auto ? STATUS.PROCESSING : STATUS.QUEUED,
  });
  return getById(info.lastInsertRowid);
}

function getById(id) { return db.prepare('SELECT * FROM orders WHERE id = ?').get(id); }
function getByCode(code) { return db.prepare('SELECT * FROM orders WHERE code = ?').get(code); }
function getByCodeForUser(code, userId) { return db.prepare('SELECT * FROM orders WHERE code = ? AND user_id = ?').get(code, userId); }
function listForUser(userId) { return db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(userId); }

function setStatus(id, status) { db.prepare('UPDATE orders SET status=? WHERE id=?').run(status, id); return getById(id); }

function assignProvider(id, providerKey, providerOrderId) {
  const o = getById(id);
  const sent = o.sent_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
  db.prepare('UPDATE orders SET provider_key=?, provider_order_id=?, status=?, sent_at=COALESCE(sent_at,?) WHERE id=?')
    .run(providerKey, providerOrderId, STATUS.PROCESSING, sent, id);
  return getById(id);
}

function complete(id, resultText, providerKey) {
  const o = getById(id);
  db.prepare(`UPDATE orders SET status=?, result_text=?, provider_key=COALESCE(?,provider_key),
              completed_at=datetime('now'), total_seconds=? WHERE id=?`)
    .run(STATUS.COMPLETED, resultText, providerKey || null, secondsSince(o.created_at), id);
  return getById(id);
}

function reject(id) {
  const o = getById(id);
  db.prepare(`UPDATE orders SET status=?, completed_at=datetime('now'), total_seconds=? WHERE id=?`)
    .run(STATUS.REJECTED, secondsSince(o.created_at), id);
  return getById(id);
}

function markRefunded(id) { db.prepare('UPDATE orders SET refunded=1 WHERE id=?').run(id); return getById(id); }

// --- intentos por proveedor ---------------------------------------------
function createAttempt(orderId, providerKey, cost) {
  const info = db.prepare('INSERT INTO order_attempts (order_id, provider_key, cost) VALUES (?,?,?)')
    .run(orderId, providerKey, cost || null);
  return db.prepare('SELECT * FROM order_attempts WHERE id=?').get(info.lastInsertRowid);
}
function setAttemptRef(attemptId, providerOrderId) {
  db.prepare('UPDATE order_attempts SET provider_order_id=? WHERE id=?').run(providerOrderId, attemptId);
}
function resolveAttempt(attemptId, status, resultText) {
  const a = db.prepare('SELECT * FROM order_attempts WHERE id=?').get(attemptId);
  if (!a) return;
  db.prepare('UPDATE order_attempts SET status=?, result_text=?, resolved_at=datetime(\'now\'), seconds=? WHERE id=?')
    .run(status, resultText || null, secondsSince(a.sent_at), attemptId);
}
function listAttempts(orderId) { return db.prepare('SELECT * FROM order_attempts WHERE order_id=? ORDER BY id').all(orderId); }
function triedProviders(orderId) {
  return db.prepare('SELECT DISTINCT provider_key FROM order_attempts WHERE order_id=?').all(orderId).map((r) => r.provider_key);
}
function openAttemptFor(orderId, providerKey) {
  return db.prepare("SELECT * FROM order_attempts WHERE order_id=? AND provider_key=? AND status='sent' ORDER BY id DESC LIMIT 1")
    .get(orderId, providerKey);
}

// --- admin ---------------------------------------------------------------
function listProcessingAuto() {
  return db.prepare(`SELECT o.*, u.email AS user_email FROM orders o JOIN users u ON u.id=o.user_id
                     WHERE o.status='processing' AND o.auto=1 AND o.provider_order_id IS NOT NULL`).all();
}
function adminList({ status } = {}) {
  let sql = `SELECT o.*, u.email AS user_email FROM orders o JOIN users u ON u.id=o.user_id`;
  const p = [];
  if (status && status !== 'all') { sql += ' WHERE o.status=?'; p.push(status); }
  sql += ' ORDER BY o.id DESC LIMIT 500';
  return db.prepare(sql).all(...p);
}
function stats() {
  return db.prepare(`SELECT
      COUNT(*) AS total,
      SUM(status='queued') AS queued,
      SUM(status='processing') AS processing,
      SUM(status='completed') AS completed,
      SUM(status='rejected') AS rejected,
      COALESCE(SUM(CASE WHEN status IN ('completed') THEN price ELSE 0 END),0) AS revenue
    FROM orders`).get();
}

module.exports = {
  STATUS, parseSql, secondsSince,
  createOrder, getById, getByCode, getByCodeForUser, listForUser,
  setStatus, assignProvider, complete, reject, markRefunded,
  createAttempt, setAttemptRef, resolveAttempt, listAttempts, triedProviders, openAttemptFor,
  listProcessingAuto, adminList, stats,
};
