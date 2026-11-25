'use strict';
const config = require('../config');
const { db } = require('../db');
const orders = require('../orders');
const balance = require('../balance');
const notify = require('../notify');
const { getAdapter, providerName } = require('./index');

/** Fuentes activas de un servicio cuyo proveedor tiene API habilitada, ordenadas por costo */
function autoSources(serviceId) {
  const rows = db.prepare('SELECT * FROM service_sources WHERE service_id=? AND active=1 ORDER BY cost ASC').all(serviceId);
  return rows.filter((r) => {
    const p = config.getProvider(r.provider_key);
    return p && p.enabled && p.apiUrl && p.apiKey;
  });
}

function userEmail(userId) {
  const u = db.prepare('SELECT email FROM users WHERE id=?').get(userId);
  return u ? u.email : null;
}

/** Reembolsa y marca rechazada; avisa al cliente y al admin */
async function finalizeRejected(order) {
  orders.reject(order.id);
  if (!order.refunded) {
    balance.credit(order.user_id, order.price, 'refund', order.code);
    orders.markRefunded(order.id);
  }
  const email = userEmail(order.user_id);
  await notify.notifyOrderRejected(orders.getById(order.id), email).catch(() => {});
}

/** Completa la orden con el resultado del proveedor; avisa al cliente */
async function finalizeCompleted(order, resultText, providerKey) {
  const done = orders.complete(order.id, resultText, providerKey);
  const email = userEmail(order.user_id);
  await notify.notifyOrderCompleted(done, email).catch(() => {});
  return done;
}

/**
 * Intenta el siguiente proveedor no probado (mas barato primero).
 * Si ninguno queda: si ya hubo intentos -> rechazo+reembolso; si no hubo -> a cola manual.
 */
async function advance(order) {
  const tried = new Set(orders.triedProviders(order.id));
  const candidates = autoSources(order.service_id).filter((s) => !tried.has(s.provider_key));

  if (!candidates.length) {
    if (tried.size > 0) { await finalizeRejected(order); }
    else {
      // servicio marcado auto pero sin proveedor con API: pasa a cola manual
      orders.setStatus(order.id, orders.STATUS.QUEUED);
      await notify.notifyAdminNewOrder(orders.getById(order.id), 'auto sin proveedor con API → manual').catch(() => {});
    }
    return orders.getById(order.id);
  }

  const src = candidates[0];
  const adapter = getAdapter(src.provider_key);
  const attempt = orders.createAttempt(order.id, src.provider_key, src.cost);
  try {
    const { referenceId } = await adapter.placeOrder({ providerServiceId: src.provider_service_id, identifier: order.identifier });
    orders.setAttemptRef(attempt.id, referenceId);
    orders.assignProvider(order.id, src.provider_key, referenceId);
    console.log(`[fulfill] ${order.code} → ${providerName(src.provider_key)} (ref ${referenceId})`);
    return orders.getById(order.id);
  } catch (e) {
    console.error(`[fulfill] ${order.code} fallo al enviar a ${src.provider_key}: ${e.message}`);
    orders.resolveAttempt(attempt.id, 'error', e.message);
    return advance(orders.getById(order.id)); // intenta el siguiente
  }
}

/** Entrada al crear una orden automatica */
async function submitNewOrder(order) {
  if (order.auto) return advance(order);
  await notify.notifyAdminNewOrder(order, 'manual').catch(() => {});
  return order;
}

/** Revisa en los proveedores las ordenes 'processing' (auto) y resuelve/failover */
async function pollProcessing() {
  const rows = orders.listProcessingAuto();
  for (const o of rows) {
    const adapter = getAdapter(o.provider_key);
    if (!adapter) continue;
    try {
      const r = await adapter.getOrder(o.provider_order_id);
      const st = r.status;
      if (['success', 'reply', 'done', 'completed'].includes(st) && r.code) {
        const att = orders.openAttemptFor(o.id, o.provider_key);
        if (att) orders.resolveAttempt(att.id, 'success', String(r.code));
        await finalizeCompleted(o, String(r.code), o.provider_key);
        console.log(`[fulfill] ${o.code} COMPLETADA por ${providerName(o.provider_key)}`);
      } else if (['reject', 'rejected', 'error', 'cancel', 'cancelled'].includes(st)) {
        const att = orders.openAttemptFor(o.id, o.provider_key);
        if (att) orders.resolveAttempt(att.id, 'rejected', r.code || 'rechazado');
        console.log(`[fulfill] ${o.code} rechazada por ${providerName(o.provider_key)} → failover`);
        await advance(orders.getById(o.id)); // intenta el siguiente proveedor
      }
      // en proceso: se deja
    } catch (e) { console.error(`[fulfill] poll ${o.code}:`, e.message); }
  }
}

function startPoller() {
  const ms = Math.max(20, config.watchers.providerPollSeconds) * 1000;
  console.log(`[fulfill] Motor automatico activo (cada ${ms / 1000}s).`);
  setInterval(() => pollProcessing().catch(() => {}), ms);
}

module.exports = { submitNewOrder, pollProcessing, startPoller, advance, finalizeRejected, finalizeCompleted, autoSources };
