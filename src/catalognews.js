'use strict';
// Sincroniza el catálogo de cada proveedor y publica SOLO las novedades reales
// (cambios de precio y servicios nuevos ya publicados) en el modal de Novedades.
// Totalmente automático: corre cada día y al arrancar. Nunca expone proveedor ni costo.
const { db, getSetting, setSetting } = require('./db');
const config = require('./config');
const providers = require('./providers');
const announcements = require('./announcements');
const { sellPrice } = require('./markup');

const DAY_MS = 24 * 3600 * 1000;
const MIN_GAP_MS = 20 * 3600 * 1000;   // no re-sincronizar antes de 20h (evita spam en reinicios)
const MAX_PRICE_ITEMS = 12;            // si cambian más precios, se agrupa en una sola novedad

function shortTitle(t, n = 70) {
  t = String(t || '').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

// Costo + precio de venta de cada servicio ACTIVO surtido por este proveedor.
function snapshotActive(providerKey) {
  const rows = db.prepare(`
    SELECT ss.service_id AS id, ss.cost, s.title, s.markup_type, s.markup_value
    FROM service_sources ss JOIN services s ON s.id = ss.service_id
    WHERE ss.provider_key = ? AND ss.active = 1 AND s.active = 1 AND s.primary_provider = ?
  `).all(providerKey, providerKey);
  const map = new Map();
  rows.forEach((r) => map.set(r.id, {
    cost: Number(r.cost),
    title: r.title,
    price: sellPrice(r.cost, { markupType: r.markup_type, markupValue: r.markup_value }),
  }));
  return map;
}

// Sincroniza un proveedor y publica las novedades de precio detectadas.
async function syncAndAnnounce(providerKey) {
  const before = snapshotActive(providerKey);
  const res = await providers.syncCatalog(providerKey);
  const after = snapshotActive(providerKey);

  const changes = [];
  after.forEach((r, id) => {
    const b = before.get(id);
    if (!b) return;                         // nuevos llegan ocultos; se anuncian al publicarlos
    if (b.price !== r.price) changes.push({ title: r.title, oldP: b.price, newP: r.price });
  });

  if (changes.length === 1) {
    const c = changes[0];
    announcements.addAuto(`${shortTitle(c.title)} — precio actualizado: $${c.newP.toFixed(2)}`, 'price');
  } else if (changes.length > 1 && changes.length <= MAX_PRICE_ITEMS) {
    changes.forEach((c) => {
      const dir = c.newP > c.oldP ? '↑' : '↓';
      announcements.addAuto(`${shortTitle(c.title)} — nuevo precio $${c.newP.toFixed(2)} ${dir}`, 'price');
    });
  } else if (changes.length > MAX_PRICE_ITEMS) {
    announcements.addAuto(`Precios actualizados en ${changes.length} servicios`, 'price');
  }
  return { provider: providerKey, ...res, price_changes: changes.length };
}

// Novedad automática al publicar un servicio nuevo a la tienda (desde el panel).
function announceNewService(title, price) {
  const p = (price != null && !isNaN(price)) ? ` — $${Number(price).toFixed(2)}` : '';
  announcements.addAuto(`Nuevo servicio disponible: ${shortTitle(title)}${p}`, 'new');
}

async function runAll(force = false) {
  const last = Number(getSetting('catalog_news_last') || 0);
  if (!force && Date.now() - last < MIN_GAP_MS) return { skipped: true };
  setSetting('catalog_news_last', String(Date.now()));
  announcements.pruneAuto(30);
  const out = [];
  for (const p of config.providers.filter((x) => x.enabled && x.apiUrl)) {
    try { out.push(await syncAndAnnounce(p.key)); }
    catch (e) { console.error(`[catalognews] ${p.key}: ${e.message}`); }
  }
  console.log('[catalognews] sync+novedades:', JSON.stringify(out));
  return { ran: out };
}

function startCatalogNews() {
  setTimeout(() => { runAll().catch((e) => console.error('[catalognews]', e.message)); }, 60 * 1000);
  setInterval(() => { runAll().catch((e) => console.error('[catalognews]', e.message)); }, DAY_MS);
  console.log('[catalognews] programado: diario + al arrancar');
}

module.exports = { syncAndAnnounce, announceNewService, runAll, startCatalogNews, snapshotActive };
