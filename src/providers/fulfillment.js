'use strict';
const config = require('../config');
const { db } = require('../db');
const orders = require('../orders');
const balance = require('../balance');
const notify = require('../notify');
const { getAdapter, providerName, getCredit } = require('./index');

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

/** ¿El mensaje de error del proveedor indica saldo/crédito insuficiente? */
function isFundsError(msg) {
  return /insufficient|not enough|no funds?|low balance|low credit|out of credit|don'?t have .*credit|do not have .*credit|add (funds|credit)|sufficient (fund|credit|balance)|saldo insuficiente|fondos insuficientes|recarg/i
    .test(String(msg || ''));
}

/** Retiene la orden esperando que el admin recargue saldo del proveedor. El cliente la sigue viendo "procesando". */
async function holdForFunds(order, providerKey, cost) {
  orders.holdFunds(order.id, providerKey, cost);
  let credit = null;
  try { credit = await getCredit(providerKey); } catch (_) {}
  console.warn(`[fulfill] ${order.code} RETENIDA — saldo insuficiente en ${providerKey} (saldo ${credit}, costo ${cost})`);
  await notify.notifyAdminFundsHold(orders.getById(order.id), providerKey, credit, cost).catch(() => {});
  return orders.getById(order.id);
}

/**
 * Intenta surtir la orden con los proveedores activos (mas barato primero).
 *  - fresh=true -> reintento manual: reconsidera todos los proveedores (ignora intentos previos).
 *  - Falla por SALDO insuficiente y ninguno la surte -> se RETIENE (no se rechaza ni reembolsa); avisa al admin.
 *  - Falla por otra razon -> failover; si no queda ninguno -> rechazo+reembolso.
 */
async function advance(order, { fresh = false } = {}) {
  const tried = fresh ? new Set() : new Set(orders.triedProviders(order.id));
  const candidates = autoSources(order.service_id).filter((s) => !tried.has(s.provider_key));

  if (!candidates.length) {
    if (orders.getById(order.id).held_funds) return orders.getById(order.id); // sigue retenida
    if (orders.triedProviders(order.id).length > 0) { await finalizeRejected(order); }
    else {
      // servicio marcado auto pero sin proveedor con API: pasa a cola manual
      orders.setStatus(order.id, orders.STATUS.QUEUED);
      await notify.notifyAdminNewOrder(orders.getById(order.id), 'auto sin proveedor con API → manual').catch(() => {});
    }
    return orders.getById(order.id);
  }

  let fundsBlock = null; // {provider, cost} del primer proveedor sin saldo
  for (const src of candidates) {
    const adapter = getAdapter(src.provider_key);
    const attempt = orders.createAttempt(order.id, src.provider_key, src.cost);
    try {
      const { referenceId } = await adapter.placeOrder({ providerServiceId: src.provider_service_id, identifier: order.identifier });
      orders.setAttemptRef(attempt.id, referenceId);
      orders.clearHeld(order.id);
      orders.assignProvider(order.id, src.provider_key, referenceId);
      console.log(`[fulfill] ${order.code} → ${providerName(src.provider_key)} (ref ${referenceId})`);
      return orders.getById(order.id);
    } catch (e) {
      const funds = isFundsError(e.message);
      console.error(`[fulfill] ${order.code} fallo al enviar a ${src.provider_key}${funds ? ' (SALDO)' : ''}: ${e.message}`);
      orders.resolveAttempt(attempt.id, funds ? 'funds' : 'error', e.message);
      if (funds && !fundsBlock) fundsBlock = { provider: src.provider_key, cost: src.cost };
      // sigue con el siguiente proveedor
    }
  }

  // Ninguno la surtio:
  if (fundsBlock) return holdForFunds(orders.getById(order.id), fundsBlock.provider, fundsBlock.cost);
  await finalizeRejected(order);
  return orders.getById(order.id);
}

/** Reintento manual tras recargar: limpia la retencion y vuelve a intentar todos los proveedores. */
async function retryHeld(orderId) {
  const o = orders.getById(orderId);
  if (!o) return null;
  orders.clearHeld(orderId);
  return advance(o, { fresh: true });
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

module.exports = { submitNewOrder, pollProcessing, startPoller, advance, retryHeld, finalizeRejected, finalizeCompleted, autoSources, isFundsError };
