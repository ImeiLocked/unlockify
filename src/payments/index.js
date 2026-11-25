'use strict';
const config = require('../config');
const topups = require('../topups');
const balance = require('../balance');
const tron = require('./tron');
const eth = require('./eth');

const CHAINS = {
  trc20: { label: 'USDT · TRON (TRC20)', get address() { return config.usdt.trc20Address; }, fetch: tron.getIncomingUsdt },
  erc20: { label: 'USDT · Ethereum (ERC20)', get address() { return config.usdt.erc20Address; }, fetch: eth.getIncomingUsdt },
};

function sqlDate(ms) { return new Date(ms).toISOString().slice(0, 19).replace('T', ' '); }
function parseSql(s) { return Date.parse(String(s).replace(' ', 'T') + 'Z'); }

/** Asigna direccion + monto EXACTO (con nonce) a una recarga nueva */
function assignPayment(chain, baseAmount) {
  const c = CHAINS[chain];
  if (!c) throw new Error('Red no soportada');
  if (!c.address) throw new Error(`No hay wallet configurada para ${chain.toUpperCase()}`);
  let amount = Math.round(Number(baseAmount) * 100) / 100;
  let guard = 0;
  while (topups.isAmountTaken(chain, amount) && guard < 2000) {
    amount = Math.round((amount + 0.01) * 100) / 100;
    guard++;
  }
  const expiresAt = sqlDate(Date.now() + config.usdt.invoiceExpiryMinutes * 60 * 1000);
  return { payAddress: c.address, expectedAmount: amount, expiresAt };
}

function availableChains() {
  return Object.entries(CHAINS).filter(([, c]) => !!c.address).map(([key, c]) => ({ key, label: c.label, address: c.address }));
}

function amountMatches(a, b) { return Math.abs(Number(a) - Number(b)) < 0.005; }

let running = false;
async function tick(onConfirmed) {
  if (running) return;
  running = true;
  try {
    topups.expireStale();
    const pending = topups.listPendingForWatch();
    if (!pending.length) return;

    const byChain = {};
    for (const t of pending) {
      if (!CHAINS[t.chain] || !CHAINS[t.chain].address) continue;
      (byChain[t.chain] = byChain[t.chain] || []).push(t);
    }
    for (const [chain, list] of Object.entries(byChain)) {
      const c = CHAINS[chain];
      let txs = [];
      try {
        const oldest = Math.min(...list.map((t) => parseSql(t.created_at)));
        txs = await c.fetch(c.address, Math.max(0, oldest - 10 * 60 * 1000));
      } catch (e) { console.error(`[pay] ${chain}:`, e.message); continue; }

      const used = new Set();
      for (const t of list) {
        const created = parseSql(t.created_at) - 5 * 60 * 1000;
        const m = txs.find((x) => !used.has(x.txHash) && !topups.isTxUsed(x.txHash) && x.timestamp >= created && amountMatches(x.amount, t.expected_amount));
        if (m) {
          used.add(m.txHash);
          const conf = topups.markConfirmed(t.id, m.txHash);
          const res = balance.credit(t.user_id, t.expected_amount, 'topup', t.code);
          console.log(`[pay] ✅ Recarga ${t.code} confirmada: +${t.expected_amount} USDT (saldo: ${res.balance}) tx=${m.txHash}`);
          if (typeof onConfirmed === 'function') {
            conf.user_email = t.user_email; conf.new_balance = res.balance;
            Promise.resolve(onConfirmed(conf)).catch((e) => console.error('[pay] onConfirmed:', e.message));
          }
        }
      }
    }
  } finally { running = false; }
}

function startWatcher(onConfirmed) {
  if (!config.usdt.trc20Address && !config.usdt.erc20Address) {
    console.warn('[pay] ⚠️  Sin wallets USDT; el vigilante no hara nada.');
    return;
  }
  const ms = Math.max(10, config.watchers.pollSeconds) * 1000;
  console.log(`[pay] Vigilante de recargas activo (cada ${ms / 1000}s).`);
  setInterval(() => tick(onConfirmed), ms);
  setTimeout(() => tick(onConfirmed), 5000);
}

module.exports = { assignPayment, availableChains, startWatcher, CHAINS };
