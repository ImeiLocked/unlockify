'use strict';
const { db } = require('./db');
const { sellPrice, profit } = require('./markup');

function sourcesFor(serviceId) {
  return db.prepare('SELECT * FROM service_sources WHERE service_id = ? ORDER BY cost ASC').all(serviceId);
}

/** Costo efectivo para fijar el precio: el del proveedor primario si existe y esta activo, si no el mas barato activo */
function effectiveCost(service, sources) {
  const active = sources.filter((s) => s.active);
  if (!active.length) return null;
  if (service.primary_provider) {
    const p = active.find((s) => s.provider_key === service.primary_provider);
    if (p) return p;
  }
  return active.reduce((a, b) => (b.cost < a.cost ? b : a));
}

function decorate(service) {
  if (!service) return null;
  const sources = sourcesFor(service.id);
  const eff = effectiveCost(service, sources);
  const cost = eff ? eff.cost : 0;
  const price = sellPrice(cost, { markupType: service.markup_type, markupValue: service.markup_value });
  return {
    ...service,
    sources,
    cost,
    price,
    delivery_time: eff ? eff.delivery_time : '',
    profit: profit(cost, price),
    hasSource: !!eff,
  };
}

function getCatalog({ includeEmpty = false } = {}) {
  const cats = db.prepare('SELECT * FROM categories WHERE active = 1 ORDER BY sort, name').all();
  return cats
    .map((c) => {
      const services = db
        .prepare('SELECT * FROM services WHERE category_id = ? AND active = 1 ORDER BY sort, title')
        .all(c.id)
        .map(decorate)
        .filter((s) => s.hasSource); // no mostrar si no tiene de donde surtirse
      return { ...c, services };
    })
    .filter((c) => includeEmpty || c.services.length > 0);
}

function getCategoryBySlug(slug) {
  const c = db.prepare('SELECT * FROM categories WHERE slug = ? AND active = 1').get(slug);
  if (!c) return null;
  const services = db.prepare('SELECT * FROM services WHERE category_id = ? AND active = 1 ORDER BY sort, title')
    .all(c.id).map(decorate).filter((s) => s.hasSource);
  return { ...c, services };
}

function getServiceById(id) {
  const s = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (!s) return null;
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(s.category_id);
  return { ...decorate(s), category: cat };
}

/** Para el admin: todos los servicios con su info de fuentes */
function getAllServicesAdmin() {
  const rows = db.prepare(`SELECT s.*, c.name AS category_name FROM services s
                           JOIN categories c ON c.id = s.category_id
                           ORDER BY c.sort, c.name, s.sort, s.title`).all();
  return rows.map(decorate);
}

function countActiveServices() {
  return getCatalog().reduce((n, c) => n + c.services.length, 0);
}

/** Admin: todos los servicios que surte un proveedor, con su costo y precio de venta (35%).
 *  "published" = el servicio está activo en la tienda surtido POR ESTE proveedor. */
function getServicesByProvider(providerKey) {
  const rows = db.prepare(`
    SELECT s.id, s.title, s.active AS svc_active, s.primary_provider, s.auto_fulfill,
           s.markup_type, s.markup_value, c.name AS category_name,
           ss.cost, ss.active AS src_active, ss.provider_service_id, ss.delivery_time
    FROM service_sources ss
    JOIN services s ON s.id = ss.service_id
    JOIN categories c ON c.id = s.category_id
    WHERE ss.provider_key = ?
    ORDER BY c.name, s.title
  `).all(providerKey);
  return rows.map((r) => {
    const price = sellPrice(r.cost, { markupType: r.markup_type, markupValue: r.markup_value });
    const published = !!r.svc_active && !!r.src_active && r.primary_provider === providerKey;
    return {
      id: r.id, title: r.title, category_name: r.category_name,
      cost: r.cost, price, profit: profit(r.cost, price),
      provider_service_id: r.provider_service_id, delivery_time: r.delivery_time,
      svc_active: r.svc_active, src_active: r.src_active, primary_provider: r.primary_provider,
      published,
    };
  });
}

/** Admin: cuántos servicios surte el proveedor y cuántos están publicados desde él. */
function providerServiceCounts(providerKey) {
  const total = db.prepare('SELECT COUNT(*) n FROM service_sources WHERE provider_key=?').get(providerKey).n;
  const published = db.prepare(`
    SELECT COUNT(*) n FROM service_sources ss JOIN services s ON s.id=ss.service_id
    WHERE ss.provider_key=? AND s.active=1 AND ss.active=1 AND s.primary_provider=?
  `).get(providerKey, providerKey).n;
  return { total, published };
}

module.exports = {
  decorate, sourcesFor, effectiveCost,
  getCatalog, getCategoryBySlug, getServiceById, getAllServicesAdmin, countActiveServices,
  getServicesByProvider, providerServiceCounts,
};
