'use strict';
// Pagos USDT que llegaron a la wallet pero no calzaron con ninguna factura
// (ej. llegó un monto muy distinto por comisión o error). Para revisión manual del admin.
const { db } = require('./db');

function exists(txHash) {
  return !!db.prepare('SELECT 1 FROM unmatched_payments WHERE tx_hash=?').get(txHash);
}

/** Registra un pago sin emparejar (ignora si ya existe ese tx). Devuelve la fila nueva o null. */
function record({ chain, txHash, amount, from, txTime }) {
  if (!txHash || exists(txHash)) return null;
  const info = db.prepare(`INSERT INTO unmatched_payments (chain, tx_hash, amount, from_address, tx_time)
                           VALUES (?,?,?,?,?)`).run(chain, txHash, amount, from || null, txTime || null);
  return getById(info.lastInsertRowid);
}

function getById(id) { return db.prepare('SELECT * FROM unmatched_payments WHERE id=?').get(id); }
function listPending() { return db.prepare("SELECT * FROM unmatched_payments WHERE status='pending' ORDER BY id DESC").all(); }
function countPending() { return db.prepare("SELECT COUNT(*) n FROM unmatched_payments WHERE status='pending'").get().n; }

function resolve(id, userId) {
  db.prepare("UPDATE unmatched_payments SET status='resolved', resolved_user_id=? WHERE id=?").run(userId || null, id);
  return getById(id);
}
function dismiss(id) {
  db.prepare("UPDATE unmatched_payments SET status='dismissed' WHERE id=?").run(id);
  return getById(id);
}

/** Cliente más probable: la recarga (de cualquier estado) de la misma red, cercana en el tiempo,
 *  cuyo monto esperado más se parece al que llegó. */
function guessClient(p) {
  const t = p.tx_time || p.created_at;
  return db.prepare(`
    SELECT tp.code, tp.expected_amount, tp.status, tp.user_id, u.email AS user_email
    FROM topups tp JOIN users u ON u.id = tp.user_id
    WHERE tp.chain = ?
      AND ABS(strftime('%s', tp.created_at) - strftime('%s', ?)) < 10800
    ORDER BY ABS(tp.expected_amount - ?) ASC, ABS(strftime('%s', tp.created_at) - strftime('%s', ?)) ASC
    LIMIT 1
  `).get(p.chain, t, p.amount, t);
}

/** Clientes candidatos: recargas de la misma red cercanas en el tiempo, ordenadas por cercanía de monto. */
function candidates(p) {
  const t = p.tx_time || p.created_at;
  return db.prepare(`
    SELECT tp.user_id, u.email AS user_email, tp.code, tp.expected_amount, tp.status
    FROM topups tp JOIN users u ON u.id = tp.user_id
    WHERE tp.chain = ? AND ABS(strftime('%s', tp.created_at) - strftime('%s', ?)) < 21600
    ORDER BY ABS(tp.expected_amount - ?) ASC
    LIMIT 8
  `).all(p.chain, t, p.amount);
}

module.exports = { exists, record, getById, listPending, countPending, resolve, dismiss, guessClient, candidates };
