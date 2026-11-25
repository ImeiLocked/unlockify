'use strict';
const config = require('../config');
const topups = require('../topups');
const balance = require('../balance');
const unmatched = require('../unmatched');
const { getSetting, setSetting } = require('../db');
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

// Banda tolerante: acepta que llegue algo menos (comisión de la billetera/exchange)
// o un poco más (redondeo). Se acreditará SIEMPRE el monto real recibido.
function withinBand(received, expected) {
  received = Number(received); expected = Number(expected);
  if (!(received > 0)) return false;
  const lo = expected - Math.max(expected * 0.25, 3); // tolera hasta 25% (o 3 USDT) de comisión
  const hi = expected + Math.max(expected * 0.10, 1); // tolera un pequeño exceso
  return received >= lo && received <= hi;
}

let running = false;
async function tick(onConfirmed) {
  if (running) return;
  running = true;
  try {
    topups.expireStale();

    // Corte para no inundar con pagos históricos la primera vez que corre.
    let cutoff = Number(getSetting('unmatched_cutoff') || 0);
    if (!cutoff) { cutoff = Date.now(); setSetting('unmatched_cutoff', String(cutoff)); }

    const pending = topups.listPendingForWatch();
    const pendingByChain = {};
    for (const t of pending) (pendingByChain[t.chain] = pendingByChain[t.chain] || []).push(t);

    for (const [chain, c] of Object.entries(CHAINS)) {
      if (!c.address) continue;                       // solo redes con wallet configurada
      const list = pendingByChain[chain] || [];

      // Ventana de búsqueda: últimas 3h, o más atrás si hay facturas pendientes viejas.
      let sinceMs = Date.now() - 3 * 3600 * 1000;
      if (list.length) sinceMs = Math.min(sinceMs, Math.min(...list.map((t) => parseSql(t.created_at))) - 10 * 60 * 1000);

      let txs = [];
      try { txs = await c.fetch(c.address, Math.max(0, sinceMs)); }
      catch (e) { console.error(`[pay] ${chain}:`, e.message); continue; }

      const used = new Set();
      const findTx = (t, matcher) => {
        const created = parseSql(t.created_at) - 5 * 60 * 1000;
        const cands = txs.filter((x) => !used.has(x.txHash) && !topups.isTxUsed(x.txHash) && x.timestamp >= created && matcher(x.amount, t.expected_amount));
        if (!cands.length) return null;
        cands.sort((a, b) => Math.abs(a.amount - t.expected_amount) - Math.abs(b.amount - t.expected_amount)); // el más cercano al esperado
        return cands[0];
      };
      const settle = (t, m) => {
        used.add(m.txHash);
        const credited = Math.round(Number(m.amount) * 100) / 100; // lo que REALMENTE llegó
        const conf = topups.markConfirmed(t.id, m.txHash, credited);
        const res = balance.credit(t.user_id, credited, 'topup', t.code);
        console.log(`[pay] ✅ Recarga ${t.code}: +${credited} USDT (esperado ${t.expected_amount}, saldo: ${res.balance}) tx=${m.txHash}`);
        if (typeof onConfirmed === 'function') {
          conf.user_email = t.user_email; conf.new_balance = res.balance;
          Promise.resolve(onConfirmed(conf)).catch((e) => console.error('[pay] onConfirmed:', e.message));
        }
      };

      // ---- Emparejar con facturas pendientes ----
      if (list.length) {
        list.sort((a, b) => parseSql(a.created_at) - parseSql(b.created_at)); // más viejas primero
        const leftover = [];
        // Pase 1: coincidencia EXACTA (desambigua entre clientes distintos a la misma wallet)
        for (const t of list) { const m = findTx(t, amountMatches); if (m) settle(t, m); else leftover.push(t); }
        // Pase 2: tolerante (llegó de menos por comisión) → acredita el monto real
        for (const t of leftover) { const m = findTx(t, withinBand); if (m) settle(t, m); }
      }

      // ---- Pagos sin emparejar → a revisión manual + alerta ----
      for (const x of txs) {
        if (used.has(x.txHash)) continue;             // ya se acreditó a una factura
        if (x.timestamp < cutoff) continue;           // histórico previo al feature
        if (topups.isTxUsed(x.txHash)) continue;      // ya usado por una recarga
        if (unmatched.exists(x.txHash)) continue;     // ya registrado
        const rec = unmatched.record({ chain, txHash: x.txHash, amount: Math.round(Number(x.amount) * 100) / 100, from: x.from, txTime: sqlDate(x.timestamp) });
        if (rec) {
          const guess = unmatched.guessClient(rec);
          console.warn(`[pay] ⚠️ Pago sin emparejar: ${rec.amount} USDT (${chain}) tx=${rec.tx_hash}`);
          try { require('../notify').notifyAdminUnmatched(rec, guess); } catch (e) { console.error('[pay] alerta:', e.message); }
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
