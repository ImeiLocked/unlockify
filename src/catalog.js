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

module.exports = {
  decorate, sourcesFor, effectiveCost,
  getCatalog, getCategoryBySlug, getServiceById, getAllServicesAdmin, countActiveServices,
};
