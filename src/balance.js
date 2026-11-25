'use strict';
const { db } = require('./db');

function round2(n) { return Math.round(Number(n) * 100) / 100; }

function getBalance(userId) {
  const r = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
  return r ? round2(r.balance) : 0;
}

/**
 * Aplica un movimiento de saldo de forma atomica y lo registra en el ledger.
 * @param {number} userId
 * @param {number} delta  monto (+ suma, - resta)
 * @param {string} type   topup|order|refund|admin_credit|admin_debit
 * @param {string} ref    referencia (code de orden/recarga o nota)
 * @returns {{ok:boolean, balance:number, reason?:string}}
 */
const apply = db.transaction((userId, delta, type, ref) => {
  const row = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
  if (!row) return { ok: false, reason: 'usuario_inexistente', balance: 0 };
  const current = round2(row.balance);
  const next = round2(current + Number(delta));
  if (next < 0) return { ok: false, reason: 'saldo_insuficiente', balance: current };
  db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(next, userId);
  db.prepare('INSERT INTO balance_ledger (user_id, type, amount, balance_after, ref) VALUES (?,?,?,?,?)')
    .run(userId, type, round2(delta), next, ref || null);
  return { ok: true, balance: next };
});

function credit(userId, amount, type, ref) { return apply(userId, Math.abs(amount), type, ref); }
function debit(userId, amount, type, ref) { return apply(userId, -Math.abs(amount), type, ref); }

function ledger(userId, limit = 50) {
  return db.prepare('SELECT * FROM balance_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit);
}

module.exports = { getBalance, credit, debit, ledger, round2 };
