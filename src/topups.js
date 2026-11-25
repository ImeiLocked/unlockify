'use strict';
const crypto = require('crypto');
const { db } = require('./db');

const STATUS = { PENDING: 'pending', CONFIRMED: 'confirmed', EXPIRED: 'expired' };

function genCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  const b = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += alphabet[b[i] % alphabet.length];
  return `TOP-${s}`;
}

function create(data) {
  let code = genCode();
  while (db.prepare('SELECT 1 FROM topups WHERE code=?').get(code)) code = genCode();
  const info = db.prepare(`INSERT INTO topups (code,user_id,chain,amount,expected_amount,pay_address,status,expires_at)
    VALUES (@code,@user_id,@chain,@amount,@expected_amount,@pay_address,'pending',@expires_at)`)
    .run({ code, ...data });
  return getById(info.lastInsertRowid);
}

function getById(id) { return db.prepare('SELECT * FROM topups WHERE id=?').get(id); }
function getByCode(code) { return db.prepare('SELECT * FROM topups WHERE code=?').get(code); }
function getByCodeForUser(code, userId) { return db.prepare('SELECT * FROM topups WHERE code=? AND user_id=?').get(code, userId); }
function listForUser(userId) { return db.prepare('SELECT * FROM topups WHERE user_id=? ORDER BY id DESC LIMIT 50').all(userId); }

function isAmountTaken(chain, amount) {
  return !!db.prepare(`SELECT 1 FROM topups WHERE chain=? AND status='pending' AND expires_at>datetime('now')
                       AND ABS(expected_amount-?)<0.005`).get(chain, amount);
}
function isTxUsed(txHash) { return !!db.prepare('SELECT 1 FROM topups WHERE tx_hash=?').get(txHash); }

function listPendingForWatch() {
  return db.prepare(`SELECT t.*, u.email AS user_email FROM topups t JOIN users u ON u.id=t.user_id
                     WHERE t.status='pending' AND t.expires_at>datetime('now')`).all();
}
function markConfirmed(id, txHash) {
  db.prepare(`UPDATE topups SET status='confirmed', tx_hash=?, confirmed_at=datetime('now') WHERE id=? AND status='pending'`)
    .run(txHash, id);
  return getById(id);
}
function expireStale() {
  return db.prepare(`UPDATE topups SET status='expired' WHERE status='pending' AND expires_at<=datetime('now')`).run().changes;
}
function adminList(limit = 200) {
  return db.prepare(`SELECT t.*, u.email AS user_email FROM topups t JOIN users u ON u.id=t.user_id
                     ORDER BY t.id DESC LIMIT ?`).all(limit);
}

module.exports = {
  STATUS, create, getById, getByCode, getByCodeForUser, listForUser,
  isAmountTaken, isTxUsed, listPendingForWatch, markConfirmed, expireStale, adminList,
};
