'use strict';
const config = require('../config');
const { db, normalizeTitle } = require('../db');
const dhru = require('./dhru');

const ADAPTERS = { dhru };

/** Devuelve un adaptador ligado a la config del proveedor, o null */
function getAdapter(providerKey) {
  const provider = config.getProvider(providerKey);
  if (!provider) return null;
  const a = ADAPTERS[provider.type];
  if (!a) return null;
  return {
    provider,
    accountInfo: () => a.accountInfo(provider),
    listServices: () => a.listServices(provider),
    placeOrder: (args) => a.placeOrder(provider, args),
    getOrder: (ref) => a.getOrder(provider, ref),
  };
}

function providerName(key) { const p = config.getProvider(key); return p ? p.name : key; }

/** Extrae el saldo numérico de la respuesta accountinfo (soporta varias formas de Dhru). */
function extractCredit(info) {
  const a = (info && info.AccountInfo) ? info.AccountInfo : info;
  if (!a) return null;
  let raw = a.creditraw != null ? a.creditraw : (a.credit != null ? a.credit : (a.balance != null ? a.balance : null));
  if (raw == null) return null;
  const n = Number(String(raw).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Saldo en vivo del proveedor (USD). null si no se puede consultar. */
async function getCredit(providerKey) {
  const adapter = getAdapter(providerKey);
  if (!adapter) return null;
  try { return extractCredit(await adapter.accountInfo()); }
  catch (e) { console.error(`[providers] saldo ${providerKey}: ${e.message}`); return null; }
}

function slugify(s) {
  return String(s || 'general').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'general';
}

/** Importa/actualiza catalogo de un proveedor hacia services + service_sources */
async function syncCatalog(providerKey) {
  const adapter = getAdapter(providerKey);
  if (!adapter) throw new Error(`Proveedor ${providerKey} no configurado o sin credenciales`);
  const list = await adapter.listServices();

  const findCatBySlug = db.prepare('SELECT id FROM categories WHERE slug=?');
  const insCat = db.prepare('INSERT INTO categories (slug,name,active,sort) VALUES (?,?,1,0)');
  const findSvcByKey = db.prepare('SELECT id,category_id FROM services WHERE title_key=? LIMIT 1');
  const insSvc = db.prepare(`INSERT INTO services (category_id,title,title_key,identifier_type,active) VALUES (?,?,?, 'imei', 0)`);
  const findSrc = db.prepare('SELECT id FROM service_sources WHERE service_id=? AND provider_key=?');
  const insSrc = db.prepare('INSERT INTO service_sources (service_id,provider_key,provider_service_id,cost,delivery_time,active) VALUES (?,?,?,?,?,1)');
  const updSrc = db.prepare('UPDATE service_sources SET provider_service_id=?,cost=?,delivery_time=? WHERE id=?');

  let newSvc = 0, newSrc = 0, updSrcN = 0;
  const tx = db.transaction(() => {
    const catCache = {};
    for (const it of list) {
      const slug = slugify(it.group);
      if (!(slug in catCache)) {
        const c = findCatBySlug.get(slug);
        catCache[slug] = c ? c.id : insCat.run(slug, it.group || 'General').lastInsertRowid;
      }
      const catId = catCache[slug];
      const tkey = normalizeTitle(it.title);
      let svc = findSvcByKey.get(tkey);
      let serviceId;
      if (svc) serviceId = svc.id;
      else { serviceId = insSvc.run(catId, it.title, tkey).lastInsertRowid; newSvc++; }

      const src = findSrc.get(serviceId, providerKey);
      if (src) { updSrc.run(it.providerServiceId, it.cost, it.deliveryTime, src.id); updSrcN++; }
      else { insSrc.run(serviceId, providerKey, it.providerServiceId, it.cost, it.deliveryTime); newSrc++; }
    }
  });
  tx();
  return { total: list.length, servicios_nuevos: newSvc, fuentes_nuevas: newSrc, fuentes_actualizadas: updSrcN };
}

module.exports = { getAdapter, providerName, syncCatalog, slugify, getCredit, extractCredit };
